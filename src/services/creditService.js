// backend/src/services/creditService.js

const { db } = require("../config/db");
const { credits } = require("../db/schema/credits.schema");
const { sales } = require("../db/schema/sales.schema");
const { payments } = require("../db/schema/payments.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { customers } = require("../db/schema/customers.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");
const { logAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

/**
 * ✅ Which sale statuses are allowed to become credit.
 * Put your real statuses here.
 *
 * If your sale becomes "PENDING" when seller chooses CREDIT,
 * then this is correct.
 */
const ALLOWED_SALE_STATUSES_FOR_CREDIT = new Set([
  "PENDING",
  "AWAITING_PAYMENT_RECORD",
]);

function normMethod(v) {
  const m = v == null ? "" : String(v);
  const out = m.trim().toUpperCase();
  return out || "CASH";
}

function toNullableInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNote(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Create credit request (PENDING).
 * ✅ Derives customerId from sale.
 * ✅ Blocks duplicates.
 * ✅ Blocks if payment already exists.
 */
async function createCredit({ locationId, sellerId, saleId, note }) {
  const sid = Number(saleId);
  if (!Number.isInteger(sid) || sid <= 0) {
    const err = new Error("Invalid sale id");
    err.code = "BAD_SALE_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, sid), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "SALE_NOT_FOUND";
      throw err;
    }

    const saleStatus = String(sale.status || "").toUpperCase();
    if (!ALLOWED_SALE_STATUSES_FOR_CREDIT.has(saleStatus)) {
      const err = new Error("Sale cannot create credit from current status");
      err.code = "BAD_STATUS";
      err.debug = {
        saleStatus,
        allowed: Array.from(ALLOWED_SALE_STATUSES_FOR_CREDIT),
      };
      throw err;
    }

    if (!sale.customerId) {
      const err = new Error("Sale must have a customer to create credit");
      err.code = "MISSING_CUSTOMER";
      throw err;
    }

    // ✅ Ensure customer exists (location-safe)
    const custRows = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, sale.customerId),
          eq(customers.locationId, locationId),
        ),
      );

    if (!custRows[0]) {
      const err = new Error("Customer not found for this sale");
      err.code = "CUSTOMER_NOT_FOUND";
      err.debug = { customerId: sale.customerId };
      throw err;
    }

    // ✅ prevent duplicate credit per sale (race-safe with unique index too)
    const existing = await tx.execute(sql`
      SELECT id FROM credits
      WHERE sale_id = ${sid} AND location_id = ${locationId}
      LIMIT 1
    `);
    const existingRows = existing.rows || existing;
    if (existingRows.length > 0) {
      const err = new Error("Credit already exists for this sale");
      err.code = "DUPLICATE_CREDIT";
      throw err;
    }

    // ✅ don’t allow credit if payment already recorded
    const existingPay = await tx.execute(sql`
      SELECT id FROM payments
      WHERE sale_id = ${sid} AND location_id = ${locationId}
      LIMIT 1
    `);
    const payRows = existingPay.rows || existingPay;
    if (payRows.length > 0) {
      const err = new Error("Payment already recorded for this sale");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    const now = new Date();

    const [created] = await tx
      .insert(credits)
      .values({
        locationId,
        saleId: sid,
        customerId: sale.customerId,
        amount: sale.totalAmount,
        status: "PENDING",
        createdBy: sellerId,
        note: toNote(note),
        createdAt: now,
      })
      .returning();

    // ✅ FIX: include locationId (audit_logs.location_id is NOT NULL)
    await logAudit({
      locationId,
      userId: sellerId,
      action: AUDIT.CREDIT_CREATED,
      entity: "credit",
      entityId: created.id,
      description: "Credit created (pending approval)",
      meta: {
        saleId: sid,
        customerId: sale.customerId,
        amount: sale.totalAmount,
      },
    });

    return created;
  });
}

/**
 * Approve/Reject credit.
 *
 * ✅ Allowed only when status=PENDING
 * ✅ Approve -> status=APPROVED + approvedBy/approvedAt
 * ✅ Reject  -> status=REJECTED + rejectedBy/rejectedAt (NOT approved*)
 * ✅ Reject also cancels the sale (CANCELLED)
 */
async function decideCredit({
  locationId,
  managerId,
  creditId,
  decision,
  note,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const dec = String(decision || "").toUpperCase();
  if (dec !== "APPROVE" && dec !== "REJECT") {
    const err = new Error("Invalid decision");
    err.code = "BAD_DECISION";
    err.debug = { decision };
    throw err;
  }

  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(credit.status || "").toUpperCase() !== "PENDING") {
      const err = new Error("Credit already processed");
      err.code = "BAD_STATUS";
      err.debug = { status: credit.status };
      throw err;
    }

    const now = new Date();
    const cleanNote = toNote(note);

    if (dec === "REJECT") {
      // 1) Cancel sale
      await tx
        .update(sales)
        .set({
          status: "CANCELLED",
          canceledAt: now,
          canceledBy: managerId,
          cancelReason: cleanNote || "Credit rejected",
          updatedAt: now,
        })
        .where(
          and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
        );

      // 2) Mark credit as REJECTED (use rejectedBy/rejectedAt)
      await tx
        .update(credits)
        .set({
          status: "REJECTED",
          rejectedBy: managerId,
          rejectedAt: now,
          note: cleanNote || "Credit rejected (sale cancelled)",
        })
        .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

      // ✅ FIX: include locationId
      await logAudit({
        locationId,
        userId: managerId,
        action: AUDIT.CREDIT_REJECT,
        entity: "credit",
        entityId: id,
        description: "Credit rejected (sale cancelled)",
        meta: { decision: "REJECT", note: cleanNote },
      });

      return { ok: true, decision: "REJECT" };
    }

    // APPROVE
    await tx
      .update(credits)
      .set({
        status: "APPROVED",
        approvedBy: managerId,
        approvedAt: now,
        note: cleanNote || credit.note,
      })
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    // ✅ FIX: include locationId
    await logAudit({
      locationId,
      userId: managerId,
      action: AUDIT.CREDIT_APPROVE,
      entity: "credit",
      entityId: id,
      description: "Credit approved",
      meta: { note: cleanNote },
    });

    return { ok: true, decision: "APPROVE" };
  });
}

/**
 * Settle credit.
 *
 * ✅ Allowed only when status=APPROVED
 * ✅ Creates payment, writes cash ledger, completes sale, then sets credit=SETTLED
 */
async function settleCredit({
  locationId,
  cashierId,
  creditId,
  method,
  note,
  cashSessionId,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(credit.status || "").toUpperCase() !== "APPROVED") {
      const err = new Error("Credit must be approved before settlement");
      err.code = "NOT_APPROVED";
      err.debug = { status: credit.status };
      throw err;
    }

    // prevent duplicate payment for sale
    const existingPay = await tx.execute(sql`
      SELECT id FROM payments
      WHERE sale_id = ${credit.saleId} AND location_id = ${locationId}
      LIMIT 1
    `);
    const payRows = existingPay.rows || existingPay;
    if (payRows.length > 0) {
      const err = new Error("Payment already recorded for this sale");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    const now = new Date();
    const payMethod = normMethod(method);
    const csid = toNullableInt(cashSessionId);
    const cleanNote = toNote(note);

    const [payment] = await tx
      .insert(payments)
      .values({
        locationId,
        saleId: credit.saleId,
        cashierId,
        cashSessionId: csid,
        amount: credit.amount,
        method: payMethod,
        note: cleanNote || "Credit settlement",
        createdAt: now,
      })
      .returning();

    await tx
      .update(sales)
      .set({
        status: "COMPLETED",
        updatedAt: now,
      })
      .where(
        and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
      );

    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      cashSessionId: csid,
      type: "CREDIT_SETTLEMENT",
      direction: "IN",
      amount: credit.amount,
      method: payMethod,
      saleId: credit.saleId,
      paymentId: payment.id,
      note: cleanNote || "Credit settlement",
      createdAt: now,
    });

    await tx
      .update(credits)
      .set({
        status: "SETTLED",
        settledBy: cashierId,
        settledAt: now,
        note: cleanNote || credit.note,
      })
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    // ✅ FIX: include locationId
    await logAudit({
      locationId,
      userId: cashierId,
      action: AUDIT.CREDIT_SETTLED,
      entity: "credit",
      entityId: id,
      description: "Credit settled",
      meta: { method: payMethod, amount: credit.amount, cashSessionId: csid },
    });

    return { ok: true, paymentId: payment.id };
  });
}

/**
 * Legacy exports support:
 * - keep names if older controllers import them
 */
async function listOpenCredits({ locationId, q }) {
  const pattern = q ? `%${String(q).trim()}%` : null;

  // "Open credits" in the new lifecycle = not settled and not rejected
  // Most teams want PENDING + APPROVED.
  if (!pattern) {
    const res = await db.execute(sql`
      SELECT
        c.id,
        c.sale_id as "saleId",
        c.customer_id as "customerId",
        cu.name as "customerName",
        cu.phone as "customerPhone",
        c.amount,
        c.status,
        c.approved_at as "approvedAt",
        c.rejected_at as "rejectedAt",
        c.settled_at as "settledAt",
        c.created_at as "createdAt"
      FROM credits c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.location_id = ${locationId}
        AND c.status IN ('PENDING','APPROVED')
      ORDER BY c.created_at DESC
      LIMIT 50
    `);
    return res.rows || res;
  }

  const res = await db.execute(sql`
    SELECT
      c.id,
      c.sale_id as "saleId",
      c.customer_id as "customerId",
      cu.name as "customerName",
      cu.phone as "customerPhone",
      c.amount,
      c.status,
      c.approved_at as "approvedAt",
      c.rejected_at as "rejectedAt",
      c.settled_at as "settledAt",
      c.created_at as "createdAt"
    FROM credits c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId}
      AND c.status IN ('PENDING','APPROVED')
      AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  return res.rows || res;
}

async function getCreditBySale({ locationId, saleId }) {
  const sid = Number(saleId);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  const res = await db.execute(sql`
    SELECT *
    FROM credits
    WHERE location_id = ${locationId}
      AND sale_id = ${sid}
    LIMIT 1
  `);

  const rows = res.rows || res;
  return rows[0] || null;
}

module.exports = {
  createCredit,
  decideCredit, // ✅ NEW canonical name
  approveCredit: decideCredit, // ✅ backward compatible alias (if controllers call approveCredit)
  settleCredit,
  listOpenCredits,
  getCreditBySale,
};
