// backend/src/services/refundsService.js

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

function cleanMethod(m) {
  const v = String(m || "CASH").toUpperCase();
  const allowed = new Set(["CASH", "MOMO", "CARD", "BANK", "OTHER"]);
  return allowed.has(v) ? v : "CASH";
}

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
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
  const rows = r.rows || r;
  return rows?.[0]?.id ?? null;
}

function computeLineAmount(si, qty) {
  const unitPrice = Number(si.unitPrice);
  const lineTotal = Number(si.lineTotal);
  const q = Math.max(1, Math.round(qty));

  const calc = unitPrice * q;

  // Safety clamp: never refund more than the original line total
  if (Number.isFinite(lineTotal) && lineTotal > 0)
    return Math.min(calc, lineTotal);

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
    // 1) Load sale
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // Allow refunds only for COMPLETED or PARTIALLY_REFUNDED
    const st = String(sale.status || "");
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(st)) {
      const err = new Error("Sale not refundable");
      err.code = "BAD_STATUS";
      err.debug = { status: sale.status };
      throw err;
    }

    // 2) Link to payment (must exist)
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

    // 3) Resolve CASH session
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

    // 4) Load sale items
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

    // Build refund plan:
    // - if items missing => full refund (all qty)
    const plan = [];
    if (!items || items.length === 0) {
      for (const si of saleItemRows) {
        plan.push({ saleItemId: Number(si.id), qty: Number(si.qty) });
      }
    } else {
      for (const it of items)
        plan.push({ saleItemId: Number(it.saleItemId), qty: Number(it.qty) });
    }

    // Map sale items for quick lookup
    const map = new Map(saleItemRows.map((si) => [Number(si.id), si]));
    for (const p of plan) {
      if (!map.has(p.saleItemId)) {
        const err = new Error("Sale item not found on this sale");
        err.code = "BAD_ITEMS";
        err.debug = { saleItemId: p.saleItemId };
        throw err;
      }
    }

    // 5) Create refund header first (total_amount will be recalculated by DB trigger after we insert items)
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

    // 6) Insert refund items + restore inventory for each
    let computedTotal = 0;

    for (const p of plan) {
      const si = map.get(p.saleItemId);
      const qty = Math.max(1, Math.round(p.qty));
      const productId = Number(si.productId);

      const lineAmount = computeLineAmount(si, qty);
      computedTotal += lineAmount;

      // Insert refund item (DB trigger blocks over-refund qty)
      await tx.insert(refundItems).values({
        refundId: Number(refund.id),
        saleItemId: Number(si.id),
        productId,
        qty,
        amount: lineAmount,
      });

      // Restore inventory
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

    // 7) Ledger OUT for total
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

    // 8) Update sale status (PARTIALLY_REFUNDED or REFUNDED)
    // Determine if all quantities are refunded for this sale:
    const remain = await tx.execute(sql`
      SELECT
        SUM(si.qty)::int as sold_qty,
        COALESCE(SUM(ri.qty),0)::int as refunded_qty
      FROM sale_items si
      LEFT JOIN refund_items ri ON ri.sale_item_id = si.id
      WHERE si.sale_id = ${saleId}
    `);

    const r0 = (remain.rows || remain || [])[0] || {
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

    // 9) Audit
    await tx.insert(auditLogs).values({
      locationId,
      userId,
      action: "REFUND_CREATE",
      entity: "sale",
      entityId: saleId,
      description: `Refund created sale #${saleId}, total=${computedTotal}, method=${m}, refundId=${refund.id}`,
      meta: null,
    });

    // 🔔 Refund created -> manager/admin (warn)
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

async function listRefunds({ locationId }) {
  const result = await db.execute(sql`
    SELECT
      r.id,
      r.sale_id as "saleId",
      r.total_amount as "totalAmount",
      r.method,
      r.reference,
      r.payment_id as "paymentId",
      r.cash_session_id as "cashSessionId",
      r.reason,
      r.created_by_user_id as "createdByUserId",
      r.created_at as "createdAt"
    FROM refunds r
    WHERE r.location_id = ${locationId}
    ORDER BY r.id DESC
    LIMIT 200
  `);
  const rows = result.rows || result || [];
  return rows.map((r) => ({
    id: Number(r.id),
    saleId: Number(r.saleId),
    totalAmount: Number(r.totalAmount || 0),
    method: String(r.method || "CASH"),
    reference: r.reference ?? null,
    paymentId: r.paymentId == null ? null : Number(r.paymentId),
    cashSessionId: r.cashSessionId == null ? null : Number(r.cashSessionId),
    reason: r.reason ?? null,
    createdByUserId: Number(r.createdByUserId),
    createdAt: r.createdAt,
  }));
}

module.exports = { createRefund, listRefunds };
