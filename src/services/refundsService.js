"use strict";

const { db } = require("../config/db");
const notificationService = require("./notificationService");
const { refunds } = require("../db/schema/refunds.schema");
const { refundItems } = require("../db/schema/refund_items.schema");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { payments } = require("../db/schema/payments.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, sql } = require("drizzle-orm");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanMethod(m) {
  const v = String(m || "CASH")
    .trim()
    .toUpperCase();
  const allowed = new Set(["CASH", "MOMO", "CARD", "BANK", "OTHER"]);
  return allowed.has(v) ? v : "CASH";
}

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function rowsOf(result) {
  return result?.rows || result || [];
}

async function findOpenCashSessionId(tx, { locationId, cashierId }) {
  const r = await tx.execute(sql`
    SELECT id
    FROM cash_sessions
    WHERE location_id = ${locationId}
      AND cashier_id = ${cashierId}
      AND status = 'OPEN'
    ORDER BY opened_at DESC
    LIMIT 1
  `);

  const rows = rowsOf(r);
  return rows?.[0]?.id ?? null;
}

function computeLineAmount(si, qty) {
  const unitPrice = Number(si.unitPrice ?? si.unit_price ?? 0) || 0;
  const lineTotal = Number(si.lineTotal ?? si.line_total ?? 0) || 0;
  const q = Math.max(1, Math.round(qty));

  const calc = unitPrice * q;

  if (Number.isFinite(lineTotal) && lineTotal > 0) {
    return Math.min(calc, lineTotal);
  }

  return calc;
}

async function createRefund({
  locationId,
  userId,
  saleId,
  reason,
  method,
  reference,
  items,
}) {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    const st = String(sale.status || "").toUpperCase();
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(st)) {
      const err = new Error("Sale not refundable");
      err.code = "BAD_STATUS";
      err.debug = { status: sale.status };
      throw err;
    }

    const payRows = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.saleId, saleId), eq(payments.locationId, locationId)),
      )
      .limit(1);

    const payment = payRows[0];
    if (!payment) {
      const err = new Error("No payment found for this sale");
      err.code = "NO_PAYMENT";
      throw err;
    }

    const m = cleanMethod(method);
    const cleanReason = cleanText(reason, 300);
    const cleanRef = cleanText(reference, 120);

    let cashSessionId = null;
    if (m === "CASH") {
      cashSessionId = await findOpenCashSessionId(tx, {
        locationId,
        cashierId: userId,
      });

      if (!cashSessionId) {
        const err = new Error("No open cash session");
        err.code = "NO_OPEN_SESSION";
        throw err;
      }
    }

    const saleItemRows = await tx
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId));

    if (!saleItemRows.length) {
      const err = new Error("Sale has no items");
      err.code = "BAD_STATUS";
      err.debug = { reason: "NO_ITEMS" };
      throw err;
    }

    const plan = [];
    if (!items || items.length === 0) {
      for (const si of saleItemRows) {
        plan.push({ saleItemId: Number(si.id), qty: Number(si.qty) });
      }
    } else {
      for (const it of items) {
        plan.push({
          saleItemId: Number(it.saleItemId),
          qty: Number(it.qty),
        });
      }
    }

    const map = new Map(saleItemRows.map((si) => [Number(si.id), si]));
    for (const p of plan) {
      if (!map.has(p.saleItemId)) {
        const err = new Error("Sale item not found on this sale");
        err.code = "BAD_ITEMS";
        err.debug = { saleItemId: p.saleItemId };
        throw err;
      }
    }

    const [refund] = await tx
      .insert(refunds)
      .values({
        locationId,
        saleId,
        createdByUserId: userId,
        totalAmount: 0,
        method: m,
        reference: cleanRef,
        paymentId: Number(payment.id),
        cashSessionId,
        reason: cleanReason,
      })
      .returning();

    let computedTotal = 0;

    for (const p of plan) {
      const si = map.get(p.saleItemId);
      const qty = Math.max(1, Math.round(p.qty));
      const productId = Number(si.productId);
      const lineAmount = computeLineAmount(si, qty);

      computedTotal += lineAmount;

      await tx.insert(refundItems).values({
        refundId: Number(refund.id),
        saleItemId: Number(si.id),
        productId,
        qty,
        amount: lineAmount,
      });

      await tx
        .insert(inventoryBalances)
        .values({ locationId, productId, qtyOnHand: 0 })
        .onConflictDoNothing();

      await tx.execute(sql`
        UPDATE inventory_balances
        SET qty_on_hand = qty_on_hand + ${qty},
            updated_at = now()
        WHERE location_id = ${locationId}
          AND product_id = ${productId}
      `);
    }

    await tx
      .update(refunds)
      .set({ totalAmount: computedTotal })
      .where(eq(refunds.id, Number(refund.id)));

    await tx.insert(cashLedger).values({
      locationId,
      cashierId: userId,
      cashSessionId,
      type: "REFUND",
      direction: "OUT",
      amount: computedTotal,
      method: m,
      reference: cleanRef,
      saleId,
      paymentId: Number(payment.id),
      note: cleanReason ? `Refund: ${cleanReason}` : "Refund issued",
    });

    const remain = await tx.execute(sql`
      SELECT
        COALESCE(SUM(si.qty), 0)::int as sold_qty,
        COALESCE(SUM(ri.qty), 0)::int as refunded_qty
      FROM sale_items si
      LEFT JOIN refund_items ri ON ri.sale_item_id = si.id
      WHERE si.sale_id = ${saleId}
    `);

    const r0 = rowsOf(remain)[0] || {
      sold_qty: 0,
      refunded_qty: 0,
    };

    const soldQty = Number(r0.sold_qty || 0);
    const refundedQty = Number(r0.refunded_qty || 0);

    const nextStatus =
      refundedQty >= soldQty && soldQty > 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

    const [updatedSale] = await tx
      .update(sales)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId,
      action: "REFUND_CREATE",
      entity: "refund",
      entityId: Number(refund.id),
      description: `Refund created for sale #${saleId}, total=${computedTotal}, method=${m}`,
      meta: {
        saleId,
        refundId: Number(refund.id),
        method: m,
      },
    });

    await notificationService.notifyRoles({
      locationId,
      roles: ["manager", "admin"],
      actorUserId: userId,
      type: "REFUND_CREATED",
      title: `Refund created for Sale #${saleId}`,
      body: `Refund total: ${computedTotal}. Method: ${m}. Refund ID: ${refund.id}.`,
      priority: "warn",
      entity: "refund",
      entityId: Number(refund.id),
    });

    return {
      refund: {
        id: Number(refund.id),
        locationId: Number(refund.locationId),
        saleId: Number(refund.saleId),
        totalAmount: Number(computedTotal),
        method: m,
        reference: cleanRef,
        paymentId: Number(payment.id),
        cashSessionId: cashSessionId == null ? null : Number(cashSessionId),
        reason: cleanReason,
        createdByUserId: Number(userId),
        createdAt: refund.createdAt,
      },
      sale: updatedSale,
    };
  });
}

async function listRefunds({
  locationId = null,
  limit = 50,
  cursor = null,
  saleId = null,
  method = null,
  q = null,
  from = null,
  toExclusive = null,
}) {
  const lim = clampInt(limit, 1, 200, 50);
  const cursorId = toInt(cursor, null);
  const saleIdInt = toInt(saleId, null);
  const methodValue = method ? cleanMethod(method) : null;
  const qValue = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationId != null) {
    where = sql`${where} AND r.location_id = ${Number(locationId)}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND r.id < ${cursorId}`;
  }

  if (saleIdInt != null && saleIdInt > 0) {
    where = sql`${where} AND r.sale_id = ${saleIdInt}`;
  }

  if (methodValue) {
    where = sql`${where} AND r.method = ${methodValue}`;
  }

  if (from) {
    where = sql`${where} AND r.created_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND r.created_at < ${toExclusive}`;
  }

  if (qValue) {
    const like = `%${qValue}%`;
    where = sql`${where} AND (
      CAST(r.id AS text) ILIKE ${like}
      OR CAST(r.sale_id AS text) ILIKE ${like}
      OR COALESCE(r.reason, '') ILIKE ${like}
      OR COALESCE(r.reference, '') ILIKE ${like}
      OR COALESCE(r.method, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
      OR COALESCE(u.name, '') ILIKE ${like}
      OR COALESCE(u.email, '') ILIKE ${like}
    )`;
  }

  const result = await db.execute(sql`
    SELECT
      r.id,
      r.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      r.sale_id as "saleId",
      s.status as "saleStatus",
      s.total_amount as "saleTotalAmount",

      r.total_amount as "totalAmount",
      r.method,
      r.reference,
      r.payment_id as "paymentId",
      r.cash_session_id as "cashSessionId",
      r.reason,

      r.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",

      r.created_at as "createdAt",

      COALESCE((
        SELECT COUNT(*)::int
        FROM refund_items ri
        WHERE ri.refund_id = r.id
      ), 0) as "itemsCount"
    FROM refunds r
    JOIN locations l
      ON l.id = r.location_id
    LEFT JOIN users u
      ON u.id = r.created_by_user_id
    LEFT JOIN sales s
      ON s.id = r.sale_id
     AND s.location_id = r.location_id
    WHERE ${where}
    ORDER BY r.id DESC
    LIMIT ${lim}
  `);

  const rows = rowsOf(result).map((r) => ({
    id: Number(r.id),
    locationId: Number(r.locationId),
    locationName: r.locationName ?? null,
    locationCode: r.locationCode ?? null,
    saleId: Number(r.saleId),
    saleStatus: r.saleStatus ?? null,
    saleTotalAmount: Number(r.saleTotalAmount || 0),
    totalAmount: Number(r.totalAmount || 0),
    method: String(r.method || "CASH"),
    reference: r.reference ?? null,
    paymentId: r.paymentId == null ? null : Number(r.paymentId),
    cashSessionId: r.cashSessionId == null ? null : Number(r.cashSessionId),
    reason: r.reason ?? null,
    createdByUserId:
      r.createdByUserId == null ? null : Number(r.createdByUserId),
    createdByName: r.createdByName ?? null,
    createdByEmail: r.createdByEmail ?? null,
    createdAt: r.createdAt,
    itemsCount: Number(r.itemsCount || 0),
  }));

  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function getRefundById({ refundId, locationId = null }) {
  const id = toInt(refundId, null);
  if (!id) return null;

  let where = sql`r.id = ${id}`;
  if (locationId != null) {
    where = sql`${where} AND r.location_id = ${Number(locationId)}`;
  }

  const headRes = await db.execute(sql`
    SELECT
      r.id,
      r.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      r.sale_id as "saleId",
      s.status as "saleStatus",
      s.total_amount as "saleTotalAmount",

      r.total_amount as "totalAmount",
      r.method,
      r.reference,
      r.payment_id as "paymentId",
      r.cash_session_id as "cashSessionId",
      r.reason,

      r.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      u.email as "createdByEmail",

      r.created_at as "createdAt"
    FROM refunds r
    JOIN locations l
      ON l.id = r.location_id
    LEFT JOIN users u
      ON u.id = r.created_by_user_id
    LEFT JOIN sales s
      ON s.id = r.sale_id
     AND s.location_id = r.location_id
    WHERE ${where}
    LIMIT 1
  `);

  const refund = rowsOf(headRes)[0];
  if (!refund) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      ri.id,
      ri.refund_id as "refundId",
      ri.sale_item_id as "saleItemId",
      ri.product_id as "productId",
      ri.qty,
      ri.amount,

      si.sale_id as "saleId",
      si.qty as "saleItemQty",
      si.unit_price as "unitPrice",
      si.line_total as "lineTotal",

      p.name as "productName",
      p.sku as "sku"
    FROM refund_items ri
    LEFT JOIN sale_items si
      ON si.id = ri.sale_item_id
    LEFT JOIN products p
      ON p.id = ri.product_id
     AND p.location_id = ${Number(refund.locationId)}
    WHERE ri.refund_id = ${id}
    ORDER BY ri.id ASC
  `);

  return {
    refund: {
      id: Number(refund.id),
      locationId: Number(refund.locationId),
      locationName: refund.locationName ?? null,
      locationCode: refund.locationCode ?? null,
      saleId: Number(refund.saleId),
      saleStatus: refund.saleStatus ?? null,
      saleTotalAmount: Number(refund.saleTotalAmount || 0),
      totalAmount: Number(refund.totalAmount || 0),
      method: String(refund.method || "CASH"),
      reference: refund.reference ?? null,
      paymentId: refund.paymentId == null ? null : Number(refund.paymentId),
      cashSessionId:
        refund.cashSessionId == null ? null : Number(refund.cashSessionId),
      reason: refund.reason ?? null,
      createdByUserId:
        refund.createdByUserId == null ? null : Number(refund.createdByUserId),
      createdByName: refund.createdByName ?? null,
      createdByEmail: refund.createdByEmail ?? null,
      createdAt: refund.createdAt,
    },
    items: rowsOf(itemsRes).map((row) => ({
      id: Number(row.id),
      refundId: Number(row.refundId),
      saleItemId: Number(row.saleItemId),
      productId: Number(row.productId),
      productName: row.productName ?? null,
      sku: row.sku ?? null,
      saleId: row.saleId == null ? null : Number(row.saleId),
      saleItemQty: Number(row.saleItemQty || 0),
      qty: Number(row.qty || 0),
      unitPrice: Number(row.unitPrice || 0),
      lineTotal: Number(row.lineTotal || 0),
      amount: Number(row.amount || 0),
    })),
  };
}

module.exports = {
  createRefund,
  listRefunds,
  getRefundById,
};
