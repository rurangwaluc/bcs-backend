// backend/src/services/refundsService.js
const { db } = require("../config/db");
const { refunds } = require("../db/schema/refunds.schema");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, sql } = require("drizzle-orm");

function toInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

function cleanMethod(m) {
  const v = String(m || "CASH").toUpperCase();
  const allowed = new Set(["CASH", "MOMO", "CARD", "BANK", "OTHER"]);
  return allowed.has(v) ? v : "CASH";
}

async function findOpenCashSessionId(tx, { locationId, cashierId }) {
  const r = await tx.execute(sql`
    SELECT id
    FROM cash_sessions
    WHERE location_id = ${locationId}
      AND cashier_id = ${cashierId}
      AND status = 'OPEN'
    ORDER BY id DESC
    LIMIT 1
  `);

  const rows = r.rows || r;
  return rows?.[0]?.id ?? null;
}

async function createRefund({
  locationId,
  userId,
  saleId,
  reason,
  method,
  reference,
}) {
  return db.transaction(async (tx) => {
    // 1) Load sale
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // 2) Only COMPLETED can be refunded (Phase 1)
    if (String(sale.status) !== "COMPLETED") {
      const err = new Error("Sale not refundable");
      err.code = "BAD_STATUS";
      err.debug = { status: sale.status };
      throw err;
    }

    // prevent double refunds
    const existing = await tx.execute(sql`
      SELECT id
      FROM refunds
      WHERE location_id = ${locationId}
        AND sale_id = ${saleId}
      LIMIT 1
    `);
    const existingRows = existing.rows || existing;
    if (existingRows.length > 0) {
      const err = new Error("Already refunded");
      err.code = "ALREADY_REFUNDED";
      throw err;
    }

    // 3) Load sale items
    const items = await tx
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId));

    if (!items.length) {
      const err = new Error("Sale has no items");
      err.code = "BAD_STATUS";
      err.debug = { reason: "NO_ITEMS" };
      throw err;
    }

    // 4) Restore stock to INVENTORY ONLY (Option A ✅)
    for (const it of items) {
      const pid = Number(it.productId);
      const qty = toInt(it.qty);

      await tx
        .insert(inventoryBalances)
        .values({ locationId, productId: pid, qtyOnHand: 0 })
        .onConflictDoNothing();

      await tx.execute(sql`
        UPDATE inventory_balances
        SET qty_on_hand = qty_on_hand + ${qty},
            updated_at = now()
        WHERE location_id = ${locationId}
          AND product_id = ${pid}
      `);
    }

    const amount = toInt(sale.totalAmount);

    // 5) Create refund record
    const [createdRefund] = await tx
      .insert(refunds)
      .values({
        locationId,
        saleId,
        amount,
        reason: reason || null,
        createdByUserId: userId,
        createdAt: new Date(),
      })
      .returning();

    // 6) Cash ledger OUT entry (session-aware for CASH)
    const m = cleanMethod(method);
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

    const cleanRef = reference ? String(reference).slice(0, 120) : null;
    const cleanNote = reason
      ? `Refund: ${String(reason).slice(0, 180)}`
      : "Refund issued";

    await tx.insert(cashLedger).values({
      locationId,
      cashierId: userId,
      cashSessionId, // null for non-cash, required for cash
      type: "REFUND",
      direction: "OUT",
      amount,
      method: m,
      reference: cleanRef,
      saleId,
      note: cleanNote,
    });

    // 7) Mark sale REFUNDED
    const [updatedSale] = await tx
      .update(sales)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    // 8) Audit (✅ FIX: include locationId because DB requires it)
    await tx.insert(auditLogs).values({
      locationId, // ✅ REQUIRED
      userId,
      action: "REFUND_CREATE",
      entity: "sale",
      entityId: saleId,
      description: `Refund created for sale #${saleId}, amount=${amount}, method=${m}`,
    });

    return { refund: createdRefund, sale: updatedSale };
  });
}

async function listRefunds({ locationId }) {
  const result = await db.execute(sql`
    SELECT
      r.id,
      r.sale_id as "saleId",
      r.amount,
      r.reason,
      r.created_by_user_id as "createdByUserId",
      r.created_at as "createdAt"
    FROM refunds r
    WHERE r.location_id = ${locationId}
    ORDER BY r.id DESC
    LIMIT 200
  `);

  return result.rows || result;
}

module.exports = { createRefund, listRefunds };
