"use strict";

const { db } = require("../config/db");
const { products } = require("../db/schema/products.schema");
const { locations } = require("../db/schema/locations.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { eq, and, sql } = require("drizzle-orm");
const { safeLogAudit } = require("./auditService");
const {
  cleanText,
  normalizeCategory,
  normalizeUnit,
  normalizePositiveInt,
  buildDisplayName,
  normalizeAttributes,
} = require("../utils/productCatalog");

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

function buildUnits(data) {
  const fallbackUnit = normalizeUnit(data.unit || "PIECE");
  const stockUnit = normalizeUnit(data.stockUnit || fallbackUnit);
  const salesUnit = normalizeUnit(data.salesUnit || stockUnit);
  const purchaseUnit = normalizeUnit(data.purchaseUnit || stockUnit);

  return {
    legacyUnit: stockUnit,
    stockUnit,
    salesUnit,
    purchaseUnit,
  };
}

function mapOwnerProductRow(row) {
  if (!row) return null;

  return {
    productId: Number(row.productId ?? row.id),
    id: Number(row.productId ?? row.id),
    locationId: Number(row.locationId),
    locationName: row.locationName ?? null,
    locationCode: row.locationCode ?? null,
    locationStatus: row.locationStatus ?? null,

    name: row.name,
    displayName:
      row.displayName ??
      buildDisplayName({
        name: row.name,
        brand: row.brand,
        model: row.model,
        size: row.size,
        color: row.color,
        material: row.material,
        variantSummary: row.variantSummary,
      }),

    category: row.category ?? "GENERAL_HARDWARE",
    subcategory: row.subcategory ?? null,

    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    supplierSku: row.supplierSku ?? null,

    brand: row.brand ?? null,
    model: row.model ?? null,
    size: row.size ?? null,
    color: row.color ?? null,
    material: row.material ?? null,
    variantSummary: row.variantSummary ?? null,

    unit: row.unit ?? row.stockUnit ?? "PIECE",
    stockUnit: row.stockUnit ?? row.unit ?? "PIECE",
    salesUnit: row.salesUnit ?? row.unit ?? "PIECE",
    purchaseUnit: row.purchaseUnit ?? row.unit ?? "PIECE",
    purchaseUnitFactor: Number(row.purchaseUnitFactor ?? 1),

    sellingPrice: Number(row.sellingPrice ?? 0),
    purchasePrice: Number(row.purchasePrice ?? row.costPrice ?? 0),
    maxDiscountPercent: Number(row.maxDiscountPercent ?? 0),

    trackInventory: row.trackInventory !== false,
    reorderLevel: Number(row.reorderLevel ?? 0),
    attributes: row.attributes ?? null,

    notes: row.notes ?? null,
    isActive: row.isActive !== false,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    qtyOnHand:
      row.qtyOnHand === undefined || row.qtyOnHand === null
        ? 0
        : Number(row.qtyOnHand || 0),
  };
}

async function getLocationOrThrow(locationId) {
  const id = toInt(locationId);
  if (!id) {
    const err = new Error("Invalid location");
    err.code = "INVALID_LOCATION";
    throw err;
  }

  const rows = await db
    .select()
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

  const byCategoryRows = await db.execute(sql`
    SELECT
      p.category AS "category",
      COUNT(*)::int AS "productsCount"
    FROM products p
    WHERE 1 = 1
    ${inactiveSql}
    GROUP BY p.category
    ORDER BY COUNT(*) DESC, p.category ASC
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
    byCategory: byCategoryRows.rows || byCategoryRows,
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
        OR COALESCE(p.display_name, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.sku, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.barcode, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.supplier_sku, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.brand, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.model, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.category, '') ILIKE ${"%" + searchValue + "%"}
        OR COALESCE(p.subcategory, '') ILIKE ${"%" + searchValue + "%"}
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
      p.display_name AS "displayName",
      p.category AS "category",
      p.subcategory AS "subcategory",

      p.sku AS "sku",
      p.barcode AS "barcode",
      p.supplier_sku AS "supplierSku",

      p.brand AS "brand",
      p.model AS "model",
      p.size AS "size",
      p.color AS "color",
      p.material AS "material",
      p.variant_summary AS "variantSummary",

      p.unit AS "unit",
      p.stock_unit AS "stockUnit",
      p.sales_unit AS "salesUnit",
      p.purchase_unit AS "purchaseUnit",
      p.purchase_unit_factor AS "purchaseUnitFactor",

      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",

      p.track_inventory AS "trackInventory",
      p.reorder_level AS "reorderLevel",
      p.attributes AS "attributes",

      p.notes AS "notes",
      p.is_active AS "isActive",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",

      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand"
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
    ORDER BY l.name ASC, p.display_name ASC NULLS LAST, p.name ASC, p.id DESC
  `);

  return (result.rows || result || []).map(mapOwnerProductRow);
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
      p.display_name AS "displayName",
      p.category AS "category",
      p.subcategory AS "subcategory",
      p.sku AS "sku",
      p.barcode AS "barcode",
      p.supplier_sku AS "supplierSku",
      p.brand AS "brand",
      p.model AS "model",
      p.size AS "size",
      p.color AS "color",
      p.material AS "material",
      p.variant_summary AS "variantSummary",
      p.unit AS "unit",
      p.stock_unit AS "stockUnit",
      p.sales_unit AS "salesUnit",
      p.purchase_unit AS "purchaseUnit",
      p.purchase_unit_factor AS "purchaseUnitFactor",
      p.notes AS "notes",
      p.track_inventory AS "trackInventory",
      p.reorder_level AS "reorderLevel",
      p.attributes AS "attributes",

      l.id::int AS "locationId",
      l.name AS "locationName",
      l.code AS "locationCode",
      l.status AS "locationStatus",

      p.selling_price AS "sellingPrice",
      p.cost_price AS "purchasePrice",
      p.max_discount_percent AS "maxDiscountPercent",
      p.is_active AS "isActive",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",

      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand"
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
    productId: rows[0].productId,
    name: rows[0].name,
    displayName: rows[0].displayName,
    category: rows[0].category,
    subcategory: rows[0].subcategory,
    sku: rows[0].sku,
    barcode: rows[0].barcode,
    supplierSku: rows[0].supplierSku,
    brand: rows[0].brand,
    model: rows[0].model,
    size: rows[0].size,
    color: rows[0].color,
    material: rows[0].material,
    variantSummary: rows[0].variantSummary,
    unit: rows[0].unit,
    stockUnit: rows[0].stockUnit,
    salesUnit: rows[0].salesUnit,
    purchaseUnit: rows[0].purchaseUnit,
    purchaseUnitFactor: Number(rows[0].purchaseUnitFactor ?? 1),
    notes: rows[0].notes,
    trackInventory: rows[0].trackInventory !== false,
    reorderLevel: Number(rows[0].reorderLevel ?? 0),
    attributes: rows[0].attributes ?? null,
    branches: rows.map((row) => ({
      locationId: row.locationId,
      locationName: row.locationName,
      locationCode: row.locationCode,
      locationStatus: row.locationStatus,
      sellingPrice: Number(row.sellingPrice ?? 0),
      purchasePrice: Number(row.purchasePrice ?? 0),
      maxDiscountPercent: Number(row.maxDiscountPercent ?? 0),
      isActive: row.isActive !== false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      qtyOnHand: Number(row.qtyOnHand ?? 0),
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
    const openingQty = normalizePositiveInt(data.openingQty, 0);
    const category = normalizeCategory(data.category);
    const { legacyUnit, stockUnit, salesUnit, purchaseUnit } = buildUnits(data);

    const name = cleanText(data.name, 180);
    const brand = cleanText(data.brand, 80);
    const model = cleanText(data.model, 80);
    const size = cleanText(data.size, 40);
    const color = cleanText(data.color, 40);
    const material = cleanText(data.material, 80);
    const variantSummary = cleanText(data.variantSummary, 200);

    const displayName =
      cleanText(data.displayName, 220) ||
      buildDisplayName({
        name,
        brand,
        model,
        size,
        color,
        material,
        variantSummary,
      });

    const [created] = await tx
      .insert(products)
      .values({
        locationId: targetLocationId,
        name,
        displayName,
        category,
        subcategory: cleanText(data.subcategory, 80),
        sku: cleanText(data.sku, 80),
        barcode: cleanText(data.barcode, 120),
        supplierSku: cleanText(data.supplierSku, 120),
        brand,
        model,
        size,
        color,
        material,
        variantSummary,
        unit: legacyUnit,
        stockUnit,
        salesUnit,
        purchaseUnit,
        purchaseUnitFactor:
          normalizePositiveInt(data.purchaseUnitFactor, 1) || 1,
        sellingPrice: normalizePositiveInt(data.sellingPrice, 0),
        costPrice: normalizePositiveInt(data.costPrice, 0),
        maxDiscountPercent: normalizePositiveInt(data.maxDiscountPercent, 0),
        notes: cleanText(data.notes, 4000),
        trackInventory: data.trackInventory !== false,
        reorderLevel: normalizePositiveInt(data.reorderLevel, 0),
        attributes: normalizeAttributes(data.attributes),
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    const existingBalance = await tx
      .select()
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
      description: `Owner created product ${displayName || name}`,
      meta: {
        locationId: targetLocationId,
        category,
        sku: cleanText(data.sku, 80),
        barcode: cleanText(data.barcode, 120),
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

async function updateOwnerProduct({ actorUser, productId, data }) {
  const parsedProductId = toInt(productId);
  if (!parsedProductId) {
    const err = new Error("Invalid product id");
    err.code = "BAD_PRODUCT_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    let nextLocationId = existing.locationId;
    if (data.locationId !== undefined) {
      const targetLocationId = toInt(data.locationId);
      if (!targetLocationId) {
        const err = new Error("Invalid location");
        err.code = "INVALID_LOCATION";
        throw err;
      }

      await ensureAssignableLocation(targetLocationId);
      nextLocationId = targetLocationId;
    }

    const category =
      data.category !== undefined
        ? normalizeCategory(data.category)
        : existing.category;

    const unitInputs = {
      unit: data.unit !== undefined ? data.unit : existing.unit,
      stockUnit:
        data.stockUnit !== undefined ? data.stockUnit : existing.stockUnit,
      salesUnit:
        data.salesUnit !== undefined ? data.salesUnit : existing.salesUnit,
      purchaseUnit:
        data.purchaseUnit !== undefined
          ? data.purchaseUnit
          : existing.purchaseUnit,
    };

    const { legacyUnit, stockUnit, salesUnit, purchaseUnit } =
      buildUnits(unitInputs);

    const name =
      data.name !== undefined ? cleanText(data.name, 180) : existing.name;
    const brand =
      data.brand !== undefined ? cleanText(data.brand, 80) : existing.brand;
    const model =
      data.model !== undefined ? cleanText(data.model, 80) : existing.model;
    const size =
      data.size !== undefined ? cleanText(data.size, 40) : existing.size;
    const color =
      data.color !== undefined ? cleanText(data.color, 40) : existing.color;
    const material =
      data.material !== undefined
        ? cleanText(data.material, 80)
        : existing.material;
    const variantSummary =
      data.variantSummary !== undefined
        ? cleanText(data.variantSummary, 200)
        : existing.variantSummary;

    const displayName =
      data.displayName !== undefined
        ? cleanText(data.displayName, 220)
        : existing.displayName;

    const finalDisplayName =
      displayName ||
      buildDisplayName({
        name,
        brand,
        model,
        size,
        color,
        material,
        variantSummary,
      });

    const patch = {
      locationId: nextLocationId,
      name,
      displayName: finalDisplayName,
      category,
      subcategory:
        data.subcategory !== undefined
          ? cleanText(data.subcategory, 80)
          : existing.subcategory,
      sku: data.sku !== undefined ? cleanText(data.sku, 80) : existing.sku,
      barcode:
        data.barcode !== undefined
          ? cleanText(data.barcode, 120)
          : existing.barcode,
      supplierSku:
        data.supplierSku !== undefined
          ? cleanText(data.supplierSku, 120)
          : existing.supplierSku,
      brand,
      model,
      size,
      color,
      material,
      variantSummary,
      unit: legacyUnit,
      stockUnit,
      salesUnit,
      purchaseUnit,
      purchaseUnitFactor:
        data.purchaseUnitFactor !== undefined
          ? normalizePositiveInt(data.purchaseUnitFactor, 1) || 1
          : Number(existing.purchaseUnitFactor ?? 1),
      sellingPrice:
        data.sellingPrice !== undefined
          ? normalizePositiveInt(data.sellingPrice, 0)
          : Number(existing.sellingPrice ?? 0),
      costPrice:
        data.costPrice !== undefined
          ? normalizePositiveInt(data.costPrice, 0)
          : Number(existing.costPrice ?? 0),
      maxDiscountPercent:
        data.maxDiscountPercent !== undefined
          ? normalizePositiveInt(data.maxDiscountPercent, 0)
          : Number(existing.maxDiscountPercent ?? 0),
      notes:
        data.notes !== undefined ? cleanText(data.notes, 4000) : existing.notes,
      trackInventory:
        data.trackInventory !== undefined
          ? data.trackInventory !== false
          : existing.trackInventory !== false,
      reorderLevel:
        data.reorderLevel !== undefined
          ? normalizePositiveInt(data.reorderLevel, 0)
          : Number(existing.reorderLevel ?? 0),
      attributes:
        data.attributes !== undefined
          ? normalizeAttributes(data.attributes)
          : existing.attributes,
      updatedAt: new Date(),
    };

    await tx
      .update(products)
      .set(patch)
      .where(eq(products.id, parsedProductId));

    if (nextLocationId !== existing.locationId) {
      const oldBalanceRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.locationId, existing.locationId),
            eq(inventoryBalances.productId, parsedProductId),
          ),
        )
        .limit(1);

      const oldQty = Number(oldBalanceRows[0]?.qtyOnHand ?? 0);

      const targetBalanceRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.locationId, nextLocationId),
            eq(inventoryBalances.productId, parsedProductId),
          ),
        )
        .limit(1);

      if (targetBalanceRows[0]) {
        await tx
          .update(inventoryBalances)
          .set({
            qtyOnHand: Number(targetBalanceRows[0].qtyOnHand ?? 0) + oldQty,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, targetBalanceRows[0].id));
      } else {
        await tx.insert(inventoryBalances).values({
          locationId: nextLocationId,
          productId: parsedProductId,
          qtyOnHand: oldQty,
          updatedAt: new Date(),
        });
      }

      if (oldBalanceRows[0]) {
        await tx
          .delete(inventoryBalances)
          .where(eq(inventoryBalances.id, oldBalanceRows[0].id));
      }
    }

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_UPDATE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner updated product ${finalDisplayName || name}`,
      meta: {
        locationId: nextLocationId,
        previousLocationId: existing.locationId,
      },
      locationId: nextLocationId,
    });

    const rows = await listOwnerProducts({ includeInactive: true });
    return rows.find((row) => row.productId === parsedProductId) || null;
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
    const foundRows = await tx
      .select()
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    const found = foundRows[0];
    if (!found) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    await tx
      .update(products)
      .set({
        costPrice: normalizePositiveInt(purchasePrice, 0),
        sellingPrice: normalizePositiveInt(sellingPrice, 0),
        maxDiscountPercent: normalizePositiveInt(maxDiscountPercent, 0),
        updatedAt: new Date(),
      })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_PRICING_UPDATE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner updated pricing for product ${found.displayName || found.name}`,
      meta: {
        purchasePrice: normalizePositiveInt(purchasePrice, 0),
        sellingPrice: normalizePositiveInt(sellingPrice, 0),
        maxDiscountPercent: normalizePositiveInt(maxDiscountPercent, 0),
      },
      locationId: found.locationId,
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
    const foundRows = await tx
      .select()
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    const found = foundRows[0];
    if (!found) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (found.isActive === false) {
      const rows = await listOwnerProducts({ includeInactive: true });
      return rows.find((row) => row.productId === parsedProductId) || null;
    }

    const cleanReason = cleanText(reason, 200);
    const nextNotes = cleanReason
      ? `${String(found.notes || "").trim()}\n[ARCHIVED] ${cleanReason}`.trim()
      : found.notes;

    await tx
      .update(products)
      .set({
        isActive: false,
        notes: nextNotes,
        updatedAt: new Date(),
      })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_ARCHIVE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner archived product ${found.displayName || found.name}`,
      meta: { reason: cleanReason },
      locationId: found.locationId,
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
    const foundRows = await tx
      .select()
      .from(products)
      .where(eq(products.id, parsedProductId))
      .limit(1);

    const found = foundRows[0];
    if (!found) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    await tx
      .update(products)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(products.id, parsedProductId));

    await safeLogAudit({
      userId: actorUser.id,
      action: "OWNER_PRODUCT_RESTORE",
      entity: "product",
      entityId: parsedProductId,
      description: `Owner restored product ${found.displayName || found.name}`,
      meta: {},
      locationId: found.locationId,
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
  updateOwnerProduct,
  updateOwnerProductPricing,
  archiveOwnerProduct,
  restoreOwnerProduct,
};
