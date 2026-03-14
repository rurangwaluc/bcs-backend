"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { and, eq } = require("drizzle-orm");

const { products } = require("../db/schema/products.schema");
const { locations } = require("../db/schema/locations.schema");
const { suppliers } = require("../db/schema/suppliers.schema");
const { users } = require("../db/schema/users.schema");
const { inventoryArrivals } = require("../db/schema/inventory_arrivals.schema");
const {
  inventoryArrivalItems,
} = require("../db/schema/inventory_arrival_items.schema");

const { safeLogAudit } = require("./auditService");
const { adjustInventory } = require("./inventoryService");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

function toInt(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value, max = 255) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeSourceType(value) {
  const v = String(value || "MANUAL")
    .trim()
    .toUpperCase();

  const allowed = new Set([
    "MANUAL",
    "PURCHASE_ORDER",
    "SUPPLIER_DELIVERY",
    "TRANSFER_IN",
    "OTHER",
  ]);

  return allowed.has(v) ? v : "MANUAL";
}

function parseDateOrNow(value) {
  const s = cleanText(value, 50);
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

async function getLocationOrThrow(tx, locationId) {
  const rows = await tx
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      status: locations.status,
    })
    .from(locations)
    .where(eq(locations.id, Number(locationId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    const err = new Error("Location not found");
    err.code = "LOCATION_NOT_FOUND";
    throw err;
  }

  return row;
}

async function getSupplierIfAny(tx, supplierId) {
  if (!supplierId) return null;

  const rows = await tx
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.id, Number(supplierId)))
    .limit(1);

  const supplier = rows[0];
  if (!supplier) {
    const err = new Error("Supplier not found");
    err.code = "SUPPLIER_NOT_FOUND";
    throw err;
  }

  return supplier;
}

async function getArrivalProductOrThrow(tx, { locationId, productId }) {
  const rows = await tx
    .select({
      id: products.id,
      locationId: products.locationId,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      costPrice: products.costPrice,
      isActive: products.isActive,
      brand: products.brand,
      model: products.model,
      size: products.size,
      color: products.color,
      variantLabel: products.variantLabel,
    })
    .from(products)
    .where(
      and(
        eq(products.id, Number(productId)),
        eq(products.locationId, Number(locationId)),
      ),
    )
    .limit(1);

  const product = rows[0];
  if (!product) {
    const err = new Error(`Product ${productId} not found in selected branch`);
    err.code = "PRODUCT_NOT_FOUND";
    err.debug = { productId };
    throw err;
  }

  if (product.isActive === false) {
    const err = new Error(`Product ${productId} is archived`);
    err.code = "PRODUCT_ARCHIVED";
    err.debug = { productId };
    throw err;
  }

  return product;
}

function computeArrivalLine(product, item) {
  const qtyReceived = Math.max(0, toInt(item.qtyReceived, 0) || 0);
  const bonusQty = Math.max(0, toInt(item.bonusQty, 0) || 0);
  const unitCost = Math.max(0, toInt(item.unitCost, 0) || 0);

  if (qtyReceived <= 0 && bonusQty <= 0) {
    const err = new Error("Arrival line must have qtyReceived or bonusQty");
    err.code = "BAD_ITEMS";
    err.debug = { productId: product.id };
    throw err;
  }

  const purchaseUnitFactor = 1;
  const stockQtyReceived = qtyReceived + bonusQty;
  const lineTotal = qtyReceived * unitCost;

  const productDisplayName = [
    cleanText(product.name, 180),
    cleanText(product.brand, 80),
    cleanText(product.model, 120),
    cleanText(product.size, 40),
    cleanText(product.color, 40),
    cleanText(product.variantLabel, 120),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    productId: Number(product.id),
    productName: product.name,
    productDisplayName: productDisplayName || product.name,
    productSku: product.sku || null,
    stockUnit: product.unit || "PIECE",
    purchaseUnit: product.unit || "PIECE",
    purchaseUnitFactor,
    qtyReceived,
    bonusQty,
    stockQtyReceived,
    unitCost,
    lineTotal,
    note: cleanText(item.note, 300),
  };
}

function mapArrivalRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    locationId: Number(row.locationId),
    locationName: row.locationName ?? null,
    locationCode: row.locationCode ?? null,

    supplierId: row.supplierId == null ? null : Number(row.supplierId),
    supplierName: row.supplierName ?? null,

    reference: row.reference ?? null,
    documentNo: row.documentNo ?? null,
    sourceType: row.sourceType ?? "MANUAL",
    sourceId: row.sourceId == null ? null : Number(row.sourceId),
    notes: row.notes ?? null,

    totalAmount: Number(row.totalAmount || 0),

    receivedByUserId:
      row.receivedByUserId == null ? null : Number(row.receivedByUserId),
    receivedByName: row.receivedByName ?? null,
    receivedByEmail: row.receivedByEmail ?? null,

    receivedAt: row.receivedAt,
    createdAt: row.createdAt,

    itemsCount: Number(row.itemsCount || 0),
    totalStockQtyReceived: Number(row.totalStockQtyReceived || 0),
  };
}

async function createInventoryArrival({
  request,
  actorUser,
  locationId,
  supplierId,
  reference,
  documentNo,
  sourceType,
  sourceId,
  notes,
  receivedAt,
  items,
}) {
  return db.transaction(async (tx) => {
    const location = await getLocationOrThrow(tx, locationId);
    await getSupplierIfAny(tx, supplierId);

    if (location.status !== "ACTIVE") {
      const err = new Error("Arrival can only be recorded on active branch");
      err.code = "LOCATION_NOT_ACTIVE";
      throw err;
    }

    const lines = [];
    let totalAmount = 0;

    for (const item of items || []) {
      const product = await getArrivalProductOrThrow(tx, {
        locationId,
        productId: item.productId,
      });

      const line = computeArrivalLine(product, item);
      lines.push(line);
      totalAmount += Number(line.lineTotal || 0);
    }

    if (!lines.length) {
      const err = new Error("Arrival items are required");
      err.code = "BAD_ITEMS";
      throw err;
    }

    const [arrival] = await tx
      .insert(inventoryArrivals)
      .values({
        locationId: Number(locationId),
        supplierId: supplierId == null ? null : Number(supplierId),
        reference: cleanText(reference, 120),
        documentNo: cleanText(documentNo, 120),
        sourceType: normalizeSourceType(sourceType),
        sourceId: sourceId == null ? null : Number(sourceId),
        notes: cleanText(notes, 4000),
        totalAmount,
        receivedByUserId: Number(actorUser.id),
        receivedAt: parseDateOrNow(receivedAt),
        createdAt: new Date(),
      })
      .returning();

    for (const line of lines) {
      await tx.insert(inventoryArrivalItems).values({
        arrivalId: Number(arrival.id),
        productId: line.productId,
        productName: line.productName,
        productDisplayName: line.productDisplayName,
        productSku: line.productSku,
        stockUnit: line.stockUnit,
        purchaseUnit: line.purchaseUnit,
        purchaseUnitFactor: line.purchaseUnitFactor,
        qtyReceived: line.qtyReceived,
        bonusQty: line.bonusQty,
        stockQtyReceived: line.stockQtyReceived,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        note: line.note,
        createdAt: new Date(),
      });

      await adjustInventory(
        {
          locationId: Number(locationId),
          userId: Number(actorUser.id),
          productId: line.productId,
          qtyChange: line.stockQtyReceived,
          reason: `Stock arrival #${arrival.id}`,
        },
        tx,
      );

      await tx
        .update(products)
        .set({
          costPrice: line.unitCost,
          updatedAt: new Date(),
        })
        .where(eq(products.id, line.productId));
    }

    await safeLogAudit({
      request,
      locationId: Number(locationId),
      userId: Number(actorUser.id),
      action: "INVENTORY_ARRIVAL_CREATE",
      entity: "inventory_arrival",
      entityId: Number(arrival.id),
      description: `Recorded stock arrival #${arrival.id}`,
      meta: {
        arrivalId: Number(arrival.id),
        supplierId: supplierId == null ? null : Number(supplierId),
        reference: cleanText(reference, 120),
        documentNo: cleanText(documentNo, 120),
        totalAmount,
        itemsCount: lines.length,
        totalStockQtyReceived: lines.reduce(
          (sum, line) => sum + Number(line.stockQtyReceived || 0),
          0,
        ),
      },
    });

    return {
      arrival: {
        id: Number(arrival.id),
        locationId: Number(arrival.locationId),
        supplierId:
          arrival.supplierId == null ? null : Number(arrival.supplierId),
        reference: arrival.reference ?? null,
        documentNo: arrival.documentNo ?? null,
        sourceType: arrival.sourceType ?? "MANUAL",
        sourceId: arrival.sourceId == null ? null : Number(arrival.sourceId),
        notes: arrival.notes ?? null,
        totalAmount: Number(arrival.totalAmount || 0),
        receivedByUserId: Number(arrival.receivedByUserId),
        receivedAt: arrival.receivedAt,
        createdAt: arrival.createdAt,
        itemsCount: lines.length,
        totalStockQtyReceived: lines.reduce(
          (sum, line) => sum + Number(line.stockQtyReceived || 0),
          0,
        ),
      },
      items: lines.map((line, idx) => ({
        id: idx + 1,
        arrivalId: Number(arrival.id),
        productId: line.productId,
        productName: line.productName,
        productDisplayName: line.productDisplayName,
        productSku: line.productSku,
        stockUnit: line.stockUnit,
        purchaseUnit: line.purchaseUnit,
        purchaseUnitFactor: line.purchaseUnitFactor,
        qtyReceived: line.qtyReceived,
        bonusQty: line.bonusQty,
        stockQtyReceived: line.stockQtyReceived,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        note: line.note,
        createdAt: arrival.createdAt,
      })),
    };
  });
}

async function listInventoryArrivals({
  locationId = null,
  supplierId = null,
  q = null,
  from = null,
  toExclusive = null,
  limit = 50,
  cursor = null,
}) {
  const lim = clampInt(limit, 1, 200, 50);
  const cursorId = toInt(cursor, null);
  const supplierIdInt = toInt(supplierId, null);
  const search = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationId != null) {
    where = sql`${where} AND ia.location_id = ${Number(locationId)}`;
  }

  if (supplierIdInt != null && supplierIdInt > 0) {
    where = sql`${where} AND ia.supplier_id = ${supplierIdInt}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND ia.id < ${cursorId}`;
  }

  if (from) {
    where = sql`${where} AND ia.received_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND ia.received_at < ${toExclusive}`;
  }

  if (search) {
    const like = `%${search}%`;
    where = sql`${where} AND (
      CAST(ia.id AS text) ILIKE ${like}
      OR COALESCE(ia.reference, '') ILIKE ${like}
      OR COALESCE(ia.document_no, '') ILIKE ${like}
      OR COALESCE(ia.source_type, '') ILIKE ${like}
      OR COALESCE(ia.notes, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
      OR COALESCE(s.name, '') ILIKE ${like}
      OR COALESCE(u.name, '') ILIKE ${like}
      OR COALESCE(u.email, '') ILIKE ${like}
    )`;
  }

  const result = await db.execute(sql`
    SELECT
      ia.id,
      ia.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      ia.supplier_id as "supplierId",
      s.name as "supplierName",

      ia.reference as "reference",
      ia.document_no as "documentNo",
      ia.source_type as "sourceType",
      ia.source_id as "sourceId",
      ia.notes as "notes",

      ia.total_amount as "totalAmount",

      ia.received_by_user_id as "receivedByUserId",
      u.name as "receivedByName",
      u.email as "receivedByEmail",

      ia.received_at as "receivedAt",
      ia.created_at as "createdAt",

      COALESCE((
        SELECT COUNT(*)::int
        FROM inventory_arrival_items iai
        WHERE iai.arrival_id = ia.id
      ), 0) as "itemsCount",

      COALESCE((
        SELECT SUM(iai.stock_qty_received)::int
        FROM inventory_arrival_items iai
        WHERE iai.arrival_id = ia.id
      ), 0) as "totalStockQtyReceived"

    FROM inventory_arrivals ia
    JOIN locations l
      ON l.id = ia.location_id
    LEFT JOIN suppliers s
      ON s.id = ia.supplier_id
    LEFT JOIN users u
      ON u.id = ia.received_by_user_id
    WHERE ${where}
    ORDER BY ia.id DESC
    LIMIT ${lim}
  `);

  const rows = (result.rows || result || []).map(mapArrivalRow);
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function getInventoryArrivalById({ arrivalId, locationId = null }) {
  const id = toInt(arrivalId, null);
  if (!id) return null;

  let where = sql`ia.id = ${id}`;
  if (locationId != null) {
    where = sql`${where} AND ia.location_id = ${Number(locationId)}`;
  }

  const headRes = await db.execute(sql`
    SELECT
      ia.id,
      ia.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      ia.supplier_id as "supplierId",
      s.name as "supplierName",

      ia.reference as "reference",
      ia.document_no as "documentNo",
      ia.source_type as "sourceType",
      ia.source_id as "sourceId",
      ia.notes as "notes",

      ia.total_amount as "totalAmount",

      ia.received_by_user_id as "receivedByUserId",
      u.name as "receivedByName",
      u.email as "receivedByEmail",

      ia.received_at as "receivedAt",
      ia.created_at as "createdAt"
    FROM inventory_arrivals ia
    JOIN locations l
      ON l.id = ia.location_id
    LEFT JOIN suppliers s
      ON s.id = ia.supplier_id
    LEFT JOIN users u
      ON u.id = ia.received_by_user_id
    WHERE ${where}
    LIMIT 1
  `);

  const head = (headRes.rows || headRes || [])[0];
  if (!head) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      iai.id,
      iai.arrival_id as "arrivalId",
      iai.product_id as "productId",
      iai.product_name as "productName",
      iai.product_display_name as "productDisplayName",
      iai.product_sku as "productSku",
      iai.stock_unit as "stockUnit",
      iai.purchase_unit as "purchaseUnit",
      iai.purchase_unit_factor as "purchaseUnitFactor",
      iai.qty_received as "qtyReceived",
      iai.bonus_qty as "bonusQty",
      iai.stock_qty_received as "stockQtyReceived",
      iai.unit_cost as "unitCost",
      iai.line_total as "lineTotal",
      iai.note as "note",
      iai.created_at as "createdAt"
    FROM inventory_arrival_items iai
    WHERE iai.arrival_id = ${id}
    ORDER BY iai.id ASC
  `);

  return {
    arrival: mapArrivalRow({
      ...head,
      itemsCount: (itemsRes.rows || itemsRes || []).length,
      totalStockQtyReceived: (itemsRes.rows || itemsRes || []).reduce(
        (sum, row) => sum + Number(row.stockQtyReceived || 0),
        0,
      ),
    }),
    items: (itemsRes.rows || itemsRes || []).map((row) => ({
      id: Number(row.id),
      arrivalId: Number(row.arrivalId),
      productId: Number(row.productId),
      productName: row.productName ?? null,
      productDisplayName: row.productDisplayName ?? null,
      productSku: row.productSku ?? null,
      stockUnit: row.stockUnit ?? "PIECE",
      purchaseUnit: row.purchaseUnit ?? "PIECE",
      purchaseUnitFactor: Number(row.purchaseUnitFactor ?? 1),
      qtyReceived: Number(row.qtyReceived || 0),
      bonusQty: Number(row.bonusQty || 0),
      stockQtyReceived: Number(row.stockQtyReceived || 0),
      unitCost: Number(row.unitCost || 0),
      lineTotal: Number(row.lineTotal || 0),
      note: row.note ?? null,
      createdAt: row.createdAt,
    })),
  };
}

module.exports = {
  createInventoryArrival,
  listInventoryArrivals,
  getInventoryArrivalById,
};
