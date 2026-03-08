const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

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
        OR COALESCE(p.sku, '') ILIKE ${"%" + searchValue + "%"}
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

  return result.rows || result;
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

  const rows = rowsResult.rows || rowsResult;

  if (!rows.length) {
    const err = new Error("Product not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return {
    productId: rows[0].productId,
    name: rows[0].name,
    sku: rows[0].sku,
    unit: rows[0].unit,
    branches: rows.map((row) => ({
      locationId: row.locationId,
      locationName: row.locationName,
      locationCode: row.locationCode,
      locationStatus: row.locationStatus,
      qtyOnHand: row.qtyOnHand,
      sellingPrice: row.sellingPrice,
      purchasePrice: row.purchasePrice,
      maxDiscountPercent: row.maxDiscountPercent,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
    })),
  };
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  parseBool,
  normalizeStockStatus,
  getOwnerInventorySummary,
  listOwnerInventory,
  getOwnerProductInventoryByProductId,
};
