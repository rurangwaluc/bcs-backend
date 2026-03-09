"use strict";

const { db } = require("../config/db");
const { sql, eq, and } = require("drizzle-orm");

const { goodsReceipts } = require("../db/schema/goods_receipts.schema");
const {
  goodsReceiptItems,
} = require("../db/schema/goods_receipt_items.schema");
const { purchaseOrders } = require("../db/schema/purchase_orders.schema");
const {
  purchaseOrderItems,
} = require("../db/schema/purchase_order_items.schema");
const { suppliers } = require("../db/schema/suppliers.schema");
const { locations } = require("../db/schema/locations.schema");
const { users } = require("../db/schema/users.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");

const { safeLogAudit } = require("./auditService");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

function toInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value, max = 255) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseDateOrNull(value) {
  const s = cleanText(value, 80);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizePOStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function mapGoodsReceiptRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    locationId: Number(row.locationId),
    locationName: row.locationName ?? null,
    locationCode: row.locationCode ?? null,

    purchaseOrderId: Number(row.purchaseOrderId),
    supplierId: Number(row.supplierId),
    supplierName: row.supplierName ?? null,

    receiptNo: row.receiptNo ?? null,
    reference: row.reference ?? null,
    note: row.note ?? null,

    receivedByUserId:
      row.receivedByUserId == null ? null : Number(row.receivedByUserId),
    receivedByName: row.receivedByName ?? null,
    receivedByEmail: row.receivedByEmail ?? null,

    receivedAt: row.receivedAt,
    totalLines: Number(row.totalLines || 0),
    totalUnitsReceived: Number(row.totalUnitsReceived || 0),
    totalAmount: Number(row.totalAmount || 0),

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getPurchaseOrderOrThrow(tx, { purchaseOrderId, locationId }) {
  const rows = await tx.execute(sql`
    SELECT
      po.id,
      po.location_id as "locationId",
      po.supplier_id as "supplierId",
      po.status as "status",
      po.po_no as "poNo",
      po.total_amount as "totalAmount"
    FROM purchase_orders po
    WHERE po.id = ${Number(purchaseOrderId)}
      AND po.location_id = ${Number(locationId)}
    LIMIT 1
  `);

  const row = (rows.rows || rows || [])[0];
  if (!row) {
    const err = new Error("Purchase order not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return row;
}

async function getPurchaseOrderItems(tx, purchaseOrderId) {
  const rows = await tx.execute(sql`
    SELECT
      poi.id,
      poi.purchase_order_id as "purchaseOrderId",
      poi.product_id as "productId",
      poi.product_name as "productName",
      poi.product_display_name as "productDisplayName",
      poi.product_sku as "productSku",
      poi.stock_unit as "stockUnit",
      poi.purchase_unit as "purchaseUnit",
      poi.purchase_unit_factor as "purchaseUnitFactor",
      poi.qty_ordered as "qtyOrdered",
      poi.qty_received as "qtyReceived",
      poi.unit_cost as "unitCost",
      poi.line_total as "lineTotal",
      poi.note as "note"
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = ${Number(purchaseOrderId)}
    ORDER BY poi.id ASC
  `);

  return rows.rows || rows || [];
}

async function createInventoryBalanceIfMissing(tx, { locationId, productId }) {
  await tx
    .insert(inventoryBalances)
    .values({
      locationId: Number(locationId),
      productId: Number(productId),
      qtyOnHand: 0,
    })
    .onConflictDoNothing();
}

async function recalcAndUpdatePurchaseOrderStatus(tx, purchaseOrderId) {
  const totalsRes = await tx.execute(sql`
    SELECT
      COALESCE(SUM(qty_ordered), 0)::int as qty_ordered_total,
      COALESCE(SUM(qty_received), 0)::int as qty_received_total
    FROM purchase_order_items
    WHERE purchase_order_id = ${Number(purchaseOrderId)}
  `);

  const totals = (totalsRes.rows || totalsRes || [])[0] || {
    qty_ordered_total: 0,
    qty_received_total: 0,
  };

  const orderedTotal = Number(totals.qty_ordered_total || 0);
  const receivedTotal = Number(totals.qty_received_total || 0);

  let nextStatus = "APPROVED";
  if (orderedTotal > 0 && receivedTotal >= orderedTotal) {
    nextStatus = "RECEIVED";
  } else if (receivedTotal > 0) {
    nextStatus = "PARTIALLY_RECEIVED";
  }

  await tx
    .update(purchaseOrders)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, Number(purchaseOrderId)));

  return {
    orderedTotal,
    receivedTotal,
    nextStatus,
  };
}

async function createGoodsReceipt({
  actorUser,
  locationId,
  purchaseOrderId,
  receiptNo,
  reference,
  note,
  receivedAt,
  items,
}) {
  return db.transaction(async (tx) => {
    const purchaseOrder = await getPurchaseOrderOrThrow(tx, {
      purchaseOrderId,
      locationId,
    });

    const currentStatus = normalizePOStatus(purchaseOrder.status);
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(currentStatus)) {
      const err = new Error(
        "Only APPROVED or PARTIALLY_RECEIVED purchase orders can be received",
      );
      err.code = "BAD_STATUS";
      throw err;
    }

    const poItems = await getPurchaseOrderItems(tx, purchaseOrderId);
    if (!poItems.length) {
      const err = new Error("Purchase order has no items");
      err.code = "BAD_ITEMS";
      throw err;
    }

    const poItemsMap = new Map(poItems.map((row) => [Number(row.id), row]));

    const receiptLines = [];
    let totalLines = 0;
    let totalUnitsReceived = 0;
    let totalAmount = 0;

    for (const raw of items || []) {
      const purchaseOrderItemId = Number(raw.purchaseOrderItemId);
      const qtyReceivedPurchase = Math.max(1, toInt(raw.qtyReceived, 0) || 0);

      const poItem = poItemsMap.get(purchaseOrderItemId);
      if (!poItem) {
        const err = new Error(
          `Purchase order item ${purchaseOrderItemId} not found`,
        );
        err.code = "BAD_ITEMS";
        err.debug = { purchaseOrderItemId };
        throw err;
      }

      if (poItem.productId == null) {
        const err = new Error(
          `Purchase order item ${purchaseOrderItemId} has no linked product and cannot be received into inventory`,
        );
        err.code = "PRODUCT_REQUIRED";
        err.debug = { purchaseOrderItemId };
        throw err;
      }

      const qtyOrdered = Number(poItem.qtyOrdered || 0);
      const qtyAlreadyReceived = Number(poItem.qtyReceived || 0);
      const qtyRemaining = Math.max(0, qtyOrdered - qtyAlreadyReceived);

      if (qtyRemaining <= 0) {
        const err = new Error(
          `Purchase order item ${purchaseOrderItemId} is already fully received`,
        );
        err.code = "OVER_RECEIPT";
        err.debug = {
          purchaseOrderItemId,
          qtyOrdered,
          qtyAlreadyReceived,
        };
        throw err;
      }

      if (qtyReceivedPurchase > qtyRemaining) {
        const err = new Error(
          `Cannot receive more than remaining quantity for PO item ${purchaseOrderItemId}`,
        );
        err.code = "OVER_RECEIPT";
        err.debug = {
          purchaseOrderItemId,
          qtyOrdered,
          qtyAlreadyReceived,
          qtyRemaining,
          attemptedQty: qtyReceivedPurchase,
        };
        throw err;
      }

      const purchaseUnitFactor = Math.max(
        1,
        toInt(poItem.purchaseUnitFactor, 1) || 1,
      );

      const qtyReceivedStock = qtyReceivedPurchase * purchaseUnitFactor;
      const unitCost = Number(poItem.unitCost || 0);
      const lineTotal = qtyReceivedPurchase * unitCost;

      receiptLines.push({
        purchaseOrderItemId,
        productId: Number(poItem.productId),
        productName: poItem.productName,
        productDisplayName: poItem.productDisplayName || poItem.productName,
        productSku: poItem.productSku || null,
        stockUnit: poItem.stockUnit || "PIECE",
        purchaseUnit: poItem.purchaseUnit || "PIECE",
        purchaseUnitFactor,
        qtyReceivedPurchase,
        qtyReceivedStock,
        unitCost,
        lineTotal,
        note: cleanText(raw.note, 300),
      });

      totalLines += 1;
      totalUnitsReceived += qtyReceivedStock;
      totalAmount += lineTotal;
    }

    const [createdReceipt] = await tx
      .insert(goodsReceipts)
      .values({
        locationId: Number(locationId),
        purchaseOrderId: Number(purchaseOrderId),
        supplierId: Number(purchaseOrder.supplierId),
        receiptNo: cleanText(receiptNo, 120),
        reference: cleanText(reference, 120),
        note: cleanText(note, 4000),
        receivedByUserId: Number(actorUser.id),
        receivedAt: parseDateOrNull(receivedAt) || new Date(),
        totalLines,
        totalUnitsReceived,
        totalAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    for (const line of receiptLines) {
      await tx.insert(goodsReceiptItems).values({
        goodsReceiptId: Number(createdReceipt.id),
        purchaseOrderItemId: Number(line.purchaseOrderItemId),
        productId: Number(line.productId),
        productName: line.productName,
        productDisplayName: line.productDisplayName,
        productSku: line.productSku,
        stockUnit: line.stockUnit,
        purchaseUnit: line.purchaseUnit,
        purchaseUnitFactor: line.purchaseUnitFactor,
        qtyReceivedPurchase: line.qtyReceivedPurchase,
        qtyReceivedStock: line.qtyReceivedStock,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        note: line.note,
        createdAt: new Date(),
      });

      await tx.execute(sql`
        UPDATE purchase_order_items
        SET
          qty_received = qty_received + ${line.qtyReceivedPurchase}
        WHERE id = ${Number(line.purchaseOrderItemId)}
      `);

      await createInventoryBalanceIfMissing(tx, {
        locationId: Number(locationId),
        productId: Number(line.productId),
      });

      await tx.execute(sql`
        UPDATE inventory_balances
        SET
          qty_on_hand = qty_on_hand + ${line.qtyReceivedStock},
          updated_at = now()
        WHERE location_id = ${Number(locationId)}
          AND product_id = ${Number(line.productId)}
      `);
    }

    const poSummary = await recalcAndUpdatePurchaseOrderStatus(
      tx,
      Number(purchaseOrderId),
    );

    await safeLogAudit({
      locationId: Number(locationId),
      userId: Number(actorUser.id),
      action: "GOODS_RECEIPT_CREATE",
      entity: "goods_receipt",
      entityId: Number(createdReceipt.id),
      description: `Created goods receipt #${createdReceipt.id} for purchase order #${purchaseOrderId}`,
      meta: {
        goodsReceiptId: Number(createdReceipt.id),
        purchaseOrderId: Number(purchaseOrderId),
        totalLines,
        totalUnitsReceived,
        totalAmount,
        purchaseOrderStatus: poSummary.nextStatus,
      },
    });

    await safeLogAudit({
      locationId: Number(locationId),
      userId: Number(actorUser.id),
      action: "PURCHASE_ORDER_RECEIVE",
      entity: "purchase_order",
      entityId: Number(purchaseOrderId),
      description: `Received goods against purchase order #${purchaseOrderId}`,
      meta: {
        goodsReceiptId: Number(createdReceipt.id),
        purchaseOrderId: Number(purchaseOrderId),
        totalLines,
        totalUnitsReceived,
        totalAmount,
        nextStatus: poSummary.nextStatus,
      },
    });

    return getGoodsReceiptById({
      goodsReceiptId: Number(createdReceipt.id),
      locationId: null,
    });
  });
}

async function listGoodsReceipts({
  locationId = null,
  purchaseOrderId = null,
  supplierId = null,
  q = null,
  from = null,
  toExclusive = null,
  limit = 50,
  cursor = null,
}) {
  const lim = clampInt(limit, 1, 200, 50);
  const cursorId = toInt(cursor, null);
  const purchaseOrderIdInt = toInt(purchaseOrderId, null);
  const supplierIdInt = toInt(supplierId, null);
  const search = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationId != null) {
    where = sql`${where} AND gr.location_id = ${Number(locationId)}`;
  }

  if (purchaseOrderIdInt != null) {
    where = sql`${where} AND gr.purchase_order_id = ${purchaseOrderIdInt}`;
  }

  if (supplierIdInt != null) {
    where = sql`${where} AND gr.supplier_id = ${supplierIdInt}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND gr.id < ${cursorId}`;
  }

  if (from) {
    where = sql`${where} AND gr.received_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND gr.received_at < ${toExclusive}`;
  }

  if (search) {
    const like = `%${search}%`;
    where = sql`${where} AND (
      CAST(gr.id AS text) ILIKE ${like}
      OR CAST(gr.purchase_order_id AS text) ILIKE ${like}
      OR COALESCE(gr.receipt_no, '') ILIKE ${like}
      OR COALESCE(gr.reference, '') ILIKE ${like}
      OR COALESCE(gr.note, '') ILIKE ${like}
      OR COALESCE(s.name, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
      OR COALESCE(u.name, '') ILIKE ${like}
      OR COALESCE(u.email, '') ILIKE ${like}
    )`;
  }

  const result = await db.execute(sql`
    SELECT
      gr.id,
      gr.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      gr.purchase_order_id as "purchaseOrderId",

      gr.supplier_id as "supplierId",
      s.name as "supplierName",

      gr.receipt_no as "receiptNo",
      gr.reference as "reference",
      gr.note as "note",

      gr.received_by_user_id as "receivedByUserId",
      u.name as "receivedByName",
      u.email as "receivedByEmail",

      gr.received_at as "receivedAt",
      gr.total_lines as "totalLines",
      gr.total_units_received as "totalUnitsReceived",
      gr.total_amount as "totalAmount",
      gr.created_at as "createdAt",
      gr.updated_at as "updatedAt"
    FROM goods_receipts gr
    JOIN locations l
      ON l.id = gr.location_id
    JOIN suppliers s
      ON s.id = gr.supplier_id
    LEFT JOIN users u
      ON u.id = gr.received_by_user_id
    WHERE ${where}
    ORDER BY gr.id DESC
    LIMIT ${lim}
  `);

  const rows = (result.rows || result || []).map(mapGoodsReceiptRow);
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function getGoodsReceiptById({ goodsReceiptId, locationId = null }) {
  const id = toInt(goodsReceiptId, null);
  if (!id) return null;

  let where = sql`gr.id = ${id}`;
  if (locationId != null) {
    where = sql`${where} AND gr.location_id = ${Number(locationId)}`;
  }

  const headRes = await db.execute(sql`
    SELECT
      gr.id,
      gr.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      gr.purchase_order_id as "purchaseOrderId",

      gr.supplier_id as "supplierId",
      s.name as "supplierName",

      gr.receipt_no as "receiptNo",
      gr.reference as "reference",
      gr.note as "note",

      gr.received_by_user_id as "receivedByUserId",
      u.name as "receivedByName",
      u.email as "receivedByEmail",

      gr.received_at as "receivedAt",
      gr.total_lines as "totalLines",
      gr.total_units_received as "totalUnitsReceived",
      gr.total_amount as "totalAmount",
      gr.created_at as "createdAt",
      gr.updated_at as "updatedAt"
    FROM goods_receipts gr
    JOIN locations l
      ON l.id = gr.location_id
    JOIN suppliers s
      ON s.id = gr.supplier_id
    LEFT JOIN users u
      ON u.id = gr.received_by_user_id
    WHERE ${where}
    LIMIT 1
  `);

  const head = (headRes.rows || headRes || [])[0];
  if (!head) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      gri.id,
      gri.goods_receipt_id as "goodsReceiptId",
      gri.purchase_order_item_id as "purchaseOrderItemId",
      gri.product_id as "productId",
      gri.product_name as "productName",
      gri.product_display_name as "productDisplayName",
      gri.product_sku as "productSku",
      gri.stock_unit as "stockUnit",
      gri.purchase_unit as "purchaseUnit",
      gri.purchase_unit_factor as "purchaseUnitFactor",
      gri.qty_received_purchase as "qtyReceivedPurchase",
      gri.qty_received_stock as "qtyReceivedStock",
      gri.unit_cost as "unitCost",
      gri.line_total as "lineTotal",
      gri.note as "note",
      gri.created_at as "createdAt"
    FROM goods_receipt_items gri
    WHERE gri.goods_receipt_id = ${id}
    ORDER BY gri.id ASC
  `);

  return {
    goodsReceipt: mapGoodsReceiptRow(head),
    items: (itemsRes.rows || itemsRes || []).map((row) => ({
      id: Number(row.id),
      goodsReceiptId: Number(row.goodsReceiptId),
      purchaseOrderItemId: Number(row.purchaseOrderItemId),
      productId: Number(row.productId),
      productName: row.productName ?? null,
      productDisplayName: row.productDisplayName ?? null,
      productSku: row.productSku ?? null,
      stockUnit: row.stockUnit ?? "PIECE",
      purchaseUnit: row.purchaseUnit ?? "PIECE",
      purchaseUnitFactor: Number(row.purchaseUnitFactor || 1),
      qtyReceivedPurchase: Number(row.qtyReceivedPurchase || 0),
      qtyReceivedStock: Number(row.qtyReceivedStock || 0),
      unitCost: Number(row.unitCost || 0),
      lineTotal: Number(row.lineTotal || 0),
      note: row.note ?? null,
      createdAt: row.createdAt,
    })),
  };
}

module.exports = {
  createGoodsReceipt,
  listGoodsReceipts,
  getGoodsReceiptById,
};
