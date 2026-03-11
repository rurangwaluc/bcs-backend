"use strict";

const { db } = require("../config/db");
const { sql, and, eq } = require("drizzle-orm");
const { products } = require("../db/schema/products.schema");
const { locations } = require("../db/schema/locations.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { safeLogAudit } = require("./auditService");

const LOW_STOCK_THRESHOLD = 5;

function parseBool(v) {
  return String(v || "").toLowerCase() === "true" || String(v || "") === "1";
}

function normalizeStockStatus(v) {
  const value = String(v || "ALL")
    .trim()
    .toUpperCase();

  if (["ALL", "LOW", "OUT", "IN_STOCK"].includes(value)) return value;
  return "ALL";
}

function mapOwnerInventoryRow(row) {
  if (!row) return null;

  return {
    productId: Number(row.productId ?? row.product_id ?? 0),
    locationId: Number(row.locationId ?? row.location_id ?? 0),
    locationName: row.locationName ?? row.location_name ?? "",
    locationCode: row.locationCode ?? row.location_code ?? "",
    locationStatus: row.locationStatus ?? row.location_status ?? "",
    name: row.name ?? "",
    sku: row.sku ?? "",
    unit: row.unit ?? "",
    sellingPrice: Number(row.sellingPrice ?? row.selling_price ?? 0),
    purchasePrice: Number(row.purchasePrice ?? row.purchase_price ?? 0),
    maxDiscountPercent: Number(
      row.maxDiscountPercent ?? row.max_discount_percent ?? 0,
    ),
    isActive:
      row.isActive === undefined || row.isActive === null
        ? row.is_active !== false
        : row.isActive !== false,
    qtyOnHand: Number(row.qtyOnHand ?? row.qty_on_hand ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

async function getOwnerInventorySummary({ includeInactive = false } = {}) {
  const inactiveSql = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const totalsRows = await db.execute(sql`
    SELECT
      COUNT(DISTINCT l.id)::int AS "branchesCount",
      COUNT(DISTINCT p.id)::int AS "productsCount",
      COALESCE(SUM(COALESCE(b.qty_on_hand, 0)), 0)::int AS "totalQtyOnHand",
      COUNT(*) FILTER (
        WHERE COALESCE(b.qty_on_hand, 0) > 0
          AND COALESCE(b.qty_on_hand, 0) <= ${LOW_STOCK_THRESHOLD}
      )::int AS "lowStockCount",
      COUNT(*) FILTER (
        WHERE COALESCE(b.qty_on_hand, 0) <= 0
      )::int AS "outOfStockCount"
    FROM products p
    INNER JOIN locations l
      ON l.id = p.location_id
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.location_id = p.location_id
    WHERE 1 = 1
    ${inactiveSql}
  `);

  const byLocationRows = await db.execute(sql`
    SELECT
      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      COUNT(DISTINCT p.id)::int AS "productsCount",
      COALESCE(SUM(COALESCE(b.qty_on_hand, 0)), 0)::int AS "totalQtyOnHand",
      COUNT(*) FILTER (
        WHERE COALESCE(b.qty_on_hand, 0) > 0
          AND COALESCE(b.qty_on_hand, 0) <= ${LOW_STOCK_THRESHOLD}
      )::int AS "lowStockCount",
      COUNT(*) FILTER (
        WHERE COALESCE(b.qty_on_hand, 0) <= 0
      )::int AS "outOfStockCount"
    FROM locations l
    LEFT JOIN products p
      ON p.location_id = l.id
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.location_id = p.location_id
    WHERE 1 = 1
    ${inactiveSql}
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  const totals = (totalsRows.rows || totalsRows)[0] || {
    branchesCount: 0,
    productsCount: 0,
    totalQtyOnHand: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };

  return {
    totals,
    byLocation: byLocationRows.rows || byLocationRows,
  };
}

async function listOwnerInventory({
  locationId,
  includeInactive = false,
  search,
  stockStatus = "ALL",
} = {}) {
  const normalizedStockStatus = normalizeStockStatus(stockStatus);
  const parsedLocationId = Number(locationId);
  const hasLocationFilter =
    Number.isFinite(parsedLocationId) && parsedLocationId > 0;
  const searchValue = String(search || "").trim();
  const hasSearch = searchValue.length > 0;

  const inactiveSql = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const locationSql = hasLocationFilter
    ? sql`AND l.id = ${parsedLocationId}`
    : sql``;

  const searchSql = hasSearch
    ? sql`AND (
        p.name ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.display_name, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.sku, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.barcode, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.brand, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.model, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.category, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.unit, '') ILIKE ${"%" + searchValue + "%"}
        OR l.name ILIKE ${"%" + searchValue + "%"}
        OR l.code ILIKE ${"%" + searchValue + "%"}
      )`
    : sql``;

  const stockSql =
    normalizedStockStatus === "OUT"
      ? sql`AND COALESCE(b.qty_on_hand, 0) <= 0`
      : normalizedStockStatus === "LOW"
        ? sql`AND COALESCE(b.qty_on_hand, 0) > 0 AND COALESCE(b.qty_on_hand, 0) <= ${LOW_STOCK_THRESHOLD}`
        : normalizedStockStatus === "IN_STOCK"
          ? sql`AND COALESCE(b.qty_on_hand, 0) > ${LOW_STOCK_THRESHOLD}`
          : sql``;

  const result = await db.execute(sql`
    SELECT
      p.id::int AS "productId",
      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      p.name AS "name",
      p.sku AS "sku",
      p.unit AS "unit",
      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",
      p.is_active AS "isActive",
      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand",
      b.updated_at AS "updatedAt"
    FROM products p
    INNER JOIN locations l
      ON l.id = p.location_id
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.location_id = p.location_id
    WHERE 1 = 1
    ${inactiveSql}
    ${locationSql}
    ${searchSql}
    ${stockSql}
    ORDER BY l.name ASC, p.name ASC, p.id DESC
  `);

  const rows = result.rows || result || [];
  return rows.map(mapOwnerInventoryRow);
}

async function getOwnerProductInventoryByProductId({
  productId,
  includeInactive = true,
} = {}) {
  const parsedProductId = Number(productId);
  if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) {
    const err = new Error("Invalid product id");
    err.code = "BAD_PRODUCT_ID";
    throw err;
  }

  const inactiveSql = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const rowsResult = await db.execute(sql`
    SELECT
      p.id::int AS "productId",
      p.name AS "name",
      p.sku AS "sku",
      p.unit AS "unit",
      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand",
      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",
      p.is_active AS "isActive",
      b.updated_at AS "updatedAt"
    FROM products p
    INNER JOIN locations l
      ON l.id = p.location_id
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.location_id = p.location_id
    WHERE p.id = ${parsedProductId}
    ${inactiveSql}
    ORDER BY l.name ASC
  `);

  const rows = rowsResult.rows || rowsResult || [];

  if (!rows.length) {
    const err = new Error("Product not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return {
    productId: Number(rows[0].productId),
    name: rows[0].name,
    sku: rows[0].sku,
    unit: rows[0].unit,
    branches: rows.map((row) => ({
      locationId: Number(row.locationId),
      locationName: row.locationName,
      locationCode: row.locationCode,
      locationStatus: row.locationStatus,
      qtyOnHand: Number(row.qtyOnHand ?? 0),
      sellingPrice: Number(row.sellingPrice ?? 0),
      purchasePrice: Number(row.purchasePrice ?? 0),
      maxDiscountPercent: Number(row.maxDiscountPercent ?? 0),
      isActive: row.isActive !== false,
      updatedAt: row.updatedAt,
    })),
  };
}

async function adjustOwnerInventory({
  actorUser,
  locationId,
  productId,
  qtyChange,
  reason,
}) {
  const parsedLocationId = Number(locationId);
  const parsedProductId = Number(productId);
  const parsedQtyChange = Number(qtyChange);
  const cleanReason = String(reason || "").trim();

  if (!Number.isInteger(parsedLocationId) || parsedLocationId <= 0) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
    const err = new Error("Invalid product");
    err.code = "INVALID_PRODUCT";
    throw err;
  }

  if (!Number.isInteger(parsedQtyChange) || parsedQtyChange === 0) {
    const err = new Error("qtyChange must be a non-zero integer");
    err.code = "BAD_QTY_CHANGE";
    throw err;
  }

  if (cleanReason.length < 3) {
    const err = new Error("Reason is required");
    err.code = "INVALID_REASON";
    throw err;
  }

  return db.transaction(async (tx) => {
    const productRows = await tx
      .select({
        id: products.id,
        locationId: products.locationId,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        isActive: products.isActive,
        sellingPrice: products.sellingPrice,
        purchasePrice: products.costPrice,
        maxDiscountPercent: products.maxDiscountPercent,
      })
      .from(products)
      .where(
        and(
          eq(products.id, parsedProductId),
          eq(products.locationId, parsedLocationId),
        ),
      )
      .limit(1);

    const product = productRows[0];
    if (!product) {
      const err = new Error("Product not found in selected branch");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (product.isActive === false) {
      const err = new Error("Product is archived");
      err.code = "ARCHIVED";
      throw err;
    }

    const locationRows = await tx
      .select({
        id: locations.id,
        name: locations.name,
        code: locations.code,
        status: locations.status,
      })
      .from(locations)
      .where(eq(locations.id, parsedLocationId))
      .limit(1);

    const location = locationRows[0];
    if (!location) {
      const err = new Error("Location not found");
      err.code = "LOCATION_NOT_FOUND";
      throw err;
    }

    const balanceRows = await tx
      .select({
        id: inventoryBalances.id,
        qtyOnHand: inventoryBalances.qtyOnHand,
      })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, parsedLocationId),
          eq(inventoryBalances.productId, parsedProductId),
        ),
      )
      .limit(1);

    const currentQty = Number(balanceRows[0]?.qtyOnHand ?? 0);
    const nextQty = currentQty + parsedQtyChange;

    if (nextQty < 0) {
      const err = new Error("Insufficient stock");
      err.code = "INSUFFICIENT_STOCK";
      throw err;
    }

    if (balanceRows[0]) {
      await tx
        .update(inventoryBalances)
        .set({
          qtyOnHand: nextQty,
          updatedAt: new Date(),
        })
        .where(eq(inventoryBalances.id, balanceRows[0].id));
    } else {
      await tx.insert(inventoryBalances).values({
        locationId: parsedLocationId,
        productId: parsedProductId,
        qtyOnHand: nextQty,
        updatedAt: new Date(),
      });
    }

    await safeLogAudit({
      userId: actorUser?.id ?? null,
      action: "OWNER_INVENTORY_ADJUST",
      entity: "inventory_balance",
      entityId: parsedProductId,
      description: `Owner adjusted inventory for ${product.name} at ${location.name}: ${parsedQtyChange > 0 ? "+" : ""}${parsedQtyChange}`,
      meta: {
        locationId: parsedLocationId,
        productId: parsedProductId,
        qtyBefore: currentQty,
        qtyChange: parsedQtyChange,
        qtyAfter: nextQty,
        reason: cleanReason,
      },
      locationId: parsedLocationId,
    });

    return {
      productId: parsedProductId,
      locationId: parsedLocationId,
      locationName: location.name,
      locationCode: location.code,
      locationStatus: location.status,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      sellingPrice: Number(product.sellingPrice ?? 0),
      purchasePrice: Number(product.purchasePrice ?? 0),
      maxDiscountPercent: Number(product.maxDiscountPercent ?? 0),
      isActive: product.isActive !== false,
      qtyOnHand: nextQty,
      updatedAt: new Date().toISOString(),
      qtyChange: parsedQtyChange,
      reason: cleanReason,
    };
  });
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  parseBool,
  normalizeStockStatus,
  getOwnerInventorySummary,
  listOwnerInventory,
  getOwnerProductInventoryByProductId,
  adjustOwnerInventory,
};
