const { db } = require("../config/db");
const { products } = require("../db/schema/products.schema");
const { locations } = require("../db/schema/locations.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { eq, and, sql } = require("drizzle-orm");
const { safeLogAudit } = require("./auditService");

function parseBool(v) {
  return String(v || "").toLowerCase() === "true" || String(v || "") === "1";
}

function normalizeStatus(v) {
  const value = String(v || "ALL")
    .trim()
    .toUpperCase();
  if (["ALL", "ACTIVE", "ARCHIVED"].includes(value)) return value;
  return "ALL";
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getLocationOrThrow(locationId) {
  const id = toInt(locationId);
  if (!id) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      status: locations.status,
    })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);

  const location = rows[0];
  if (!location) {
    const err = new Error("Location not found");
    err.code = "LOCATION_NOT_FOUND";
    throw err;
  }

  return location;
}

async function ensureAssignableLocation(locationId) {
  const location = await getLocationOrThrow(locationId);

  if (location.status !== "ACTIVE") {
    const err = new Error("Location is not active");
    err.code = "LOCATION_NOT_ACTIVE";
    throw err;
  }

  return location;
}

async function getOwnerProductsSummary({ includeInactive = false } = {}) {
  const inactiveSql = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const totalsRows = await db.execute(sql`
    SELECT
      COUNT(DISTINCT l.id)::int AS "branchesCount",
      COUNT(*)::int AS "productsCount",
      COUNT(*) FILTER (WHERE p.is_active = true)::int AS "activeProductsCount",
      COUNT(*) FILTER (WHERE p.is_active = false)::int AS "archivedProductsCount"
    FROM products p
    INNER JOIN locations l
      ON l.id = p.location_id
    WHERE 1 = 1
    ${inactiveSql}
  `);

  const byLocationRows = await db.execute(sql`
    SELECT
      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      COUNT(p.id)::int AS "productsCount",
      COUNT(*) FILTER (WHERE p.is_active = true)::int AS "activeProductsCount",
      COUNT(*) FILTER (WHERE p.is_active = false)::int AS "archivedProductsCount"
    FROM locations l
    LEFT JOIN products p
      ON p.location_id = l.id
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  const totals = (totalsRows.rows || totalsRows)[0] || {
    branchesCount: 0,
    productsCount: 0,
    activeProductsCount: 0,
    archivedProductsCount: 0,
  };

  return {
    totals,
    byLocation: byLocationRows.rows || byLocationRows,
  };
}

async function listOwnerProducts({
  locationId,
  includeInactive = false,
  search,
  status = "ALL",
} = {}) {
  const normalizedStatus = normalizeStatus(status);
  const parsedLocationId = toInt(locationId);
  const hasLocationFilter = !!parsedLocationId;
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

  const statusSql =
    normalizedStatus === "ACTIVE"
      ? sql`AND p.is_active = true`
      : normalizedStatus === "ARCHIVED"
        ? sql`AND p.is_active = false`
        : sql``;

  const result = await db.execute(sql`
    SELECT
      p.id::int AS "productId",
      p.location_id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      p.name AS "name",
      p.sku AS "sku",
      p.unit AS "unit",
      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",
      p.notes AS "notes",
      p.is_active AS "isActive",
      p.created_at AS "createdAt",
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
    ${statusSql}
    ORDER BY l.name ASC, p.name ASC, p.id DESC
  `);

  return result.rows || result;
}

async function getOwnerProductBranchesByProductId({
  productId,
  includeInactive = true,
} = {}) {
  const parsedProductId = toInt(productId);
  if (!parsedProductId) {
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
      p.notes AS "notes",
      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",
      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",
      p.is_active AS "isActive",
      p.created_at AS "createdAt",
      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand",
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
    notes: rows[0].notes,
    branches: rows.map((row) => ({
      locationId: row.locationId,
      locationName: row.locationName,
      locationCode: row.locationCode,
      locationStatus: row.locationStatus,
      sellingPrice: row.sellingPrice,
      purchasePrice: row.purchasePrice,
      maxDiscountPercent: row.maxDiscountPercent,
      isActive: row.isActive,
      createdAt: row.createdAt,
      qtyOnHand: row.qtyOnHand,
      updatedAt: row.updatedAt,
    })),
  };
}

async function createOwnerProduct({ actorUser, data }) {
  const targetLocationId = toInt(data.locationId);
  if (!targetLocationId) {
    const err = new Error("Owner must choose a location");
    err.code = "LOCATION_REQUIRED";
    throw err;
  }

  await ensureAssignableLocation(targetLocationId);

  return db.transaction(async (tx) => {
    const openingQty = Number(data.openingQty ?? 0);

    const [created] = await tx
      .insert(products)
      .values({
        locationId: targetLocationId,
        name: String(data.name).trim(),
        sku: data.sku ? String(data.sku).trim() : null,
        unit: data.unit ? String(data.unit).trim() : "unit",
        sellingPrice: data.sellingPrice,
        costPrice: data.costPrice ?? 0,
        maxDiscountPercent: data.maxDiscountPercent ?? 0,
        notes: data.notes ? String(data.notes).trim() : null,
        isActive: true,
      })
      .returning({
        id: products.id,
      });

    const existingBalance = await tx
      .select({ id: inventoryBalances.id })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, targetLocationId),
          eq(inventoryBalances.productId, created.id),
        ),
      )
      .limit(1);

    if (!existingBalance[0]) {
      await tx.insert(inventoryBalances).values({
        locationId: targetLocationId,
        productId: created.id,
        qtyOnHand: openingQty,
        updatedAt: new Date(),
      });
    }

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_CREATE",
      entity: "product",
      entityId: created.id,
      description: `Owner created product ${String(data.name).trim()}`,
      meta: {
        locationId: targetLocationId,
        sku: data.sku ? String(data.sku).trim() : null,
        openingQty,
      },
      locationId: targetLocationId,
    });

    const rows = await listOwnerProducts({
      locationId: targetLocationId,
      includeInactive: true,
    });

    return rows.find((row) => row.productId === created.id) || null;
  });
}

async function updateOwnerProductPricing({
  actorUser,
  productId,
  purchasePrice,
  sellingPrice,
  maxDiscountPercent,
}) {
  const parsedProductId = toInt(productId);
  if (!parsedProductId) {
    const err = new Error("Invalid product id");
    err.code = "BAD_PRODUCT_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: products.id,
        locationId: products.locationId,
        name: products.name,
      })
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    await tx
      .update(products)
      .set({
        costPrice: purchasePrice,
        sellingPrice,
        maxDiscountPercent: maxDiscountPercent ?? 0,
      })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_PRICING_UPDATE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner updated pricing for product ${found[0].name}`,
      meta: {
        purchasePrice,
        sellingPrice,
        maxDiscountPercent: maxDiscountPercent ?? 0,
      },
      locationId: found[0].locationId,
    });

    const rows = await listOwnerProducts({ includeInactive: true });
    return rows.find((row) => row.productId === parsedProductId) || null;
  });
}

async function archiveOwnerProduct({ actorUser, productId, reason }) {
  const parsedProductId = toInt(productId);
  if (!parsedProductId) {
    const err = new Error("Invalid product id");
    err.code = "BAD_PRODUCT_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: products.id,
        locationId: products.locationId,
        name: products.name,
        notes: products.notes,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (found[0].isActive === false) {
      const rows = await listOwnerProducts({ includeInactive: true });
      return rows.find((row) => row.productId === parsedProductId) || null;
    }

    const cleanReason =
      String(reason || "")
        .trim()
        .slice(0, 200) || null;

    const nextNotes = cleanReason
      ? `${String(found[0].notes || "").trim()}\n[ARCHIVED] ${cleanReason}`.trim()
      : found[0].notes;

    await tx
      .update(products)
      .set({
        isActive: false,
        notes: nextNotes,
      })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_ARCHIVE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner archived product ${found[0].name}`,
      meta: { reason: cleanReason },
      locationId: found[0].locationId,
    });

    const rows = await listOwnerProducts({ includeInactive: true });
    return rows.find((row) => row.productId === parsedProductId) || null;
  });
}

async function restoreOwnerProduct({ actorUser, productId }) {
  const parsedProductId = toInt(productId);
  if (!parsedProductId) {
    const err = new Error("Invalid product id");
    err.code = "BAD_PRODUCT_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: products.id,
        locationId: products.locationId,
        name: products.name,
      })
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    await tx
      .update(products)
      .set({ isActive: true })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_RESTORE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner restored product ${found[0].name}`,
      meta: {},
      locationId: found[0].locationId,
    });

    const rows = await listOwnerProducts({ includeInactive: true });
    return rows.find((row) => row.productId === parsedProductId) || null;
  });
}

module.exports = {
  parseBool,
  normalizeStatus,
  getOwnerProductsSummary,
  listOwnerProducts,
  getOwnerProductBranchesByProductId,
  createOwnerProduct,
  updateOwnerProductPricing,
  archiveOwnerProduct,
  restoreOwnerProduct,
};
