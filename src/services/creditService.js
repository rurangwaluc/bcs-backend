// backend/src/services/creditService.js

const { db } = require("../config/db");
const { credits } = require("../db/schema/credits.schema");
const { sales } = require("../db/schema/sales.schema");
const { payments } = require("../db/schema/payments.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");
const { logAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

/**
 * Which sale statuses are allowed to become credit.
 * Add your real statuses here.
 *
 * ✅ This is where "new Set(['PENDING','AWAITING_PAYMENT_RECORD'])" belongs.
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
  return Number.isFinite(n) ? n : null;
}

async function createCredit({
  locationId,
  sellerId,
  saleId,
  customerId,
  note,
}) {
  return db.transaction(async (tx) => {
    // sale must exist and belong to location
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "SALE_NOT_FOUND";
      throw err;
    }

    const saleStatus = String(sale.status || "");
    if (!ALLOWED_SALE_STATUSES_FOR_CREDIT.has(saleStatus)) {
      const err = new Error(
        `Sale status ${saleStatus} cannot create credit (allowed: ${Array.from(
          ALLOWED_SALE_STATUSES_FOR_CREDIT,
        ).join(", ")})`,
      );
      err.code = "BAD_STATUS";
      throw err;
    }

    // prevent duplicate credit record for same sale (location-safe)
    const existing = await tx.execute(sql`
      SELECT id
      FROM credits
      WHERE sale_id = ${saleId}
        AND location_id = ${locationId}
      LIMIT 1
    `);

    const existingRows = existing.rows || existing;
    if (existingRows.length > 0) {
      const err = new Error("Credit already exists for this sale");
      err.code = "DUPLICATE_CREDIT";
      throw err;
    }

    const [created] = await tx
      .insert(credits)
      .values({
        locationId,
        saleId,
        customerId,
        amount: sale.totalAmount,
        status: "OPEN",
        createdBy: sellerId,
        note: note || null,
      })
      .returning();

    await logAudit({
      userId: sellerId,
      action: AUDIT.CREDIT_CREATED,
      entity: "credit",
      entityId: created.id,
      description: "Credit created (awaiting approval)",
      meta: { saleId, customerId, amount: sale.totalAmount },
    });

    return created;
  });
}

async function approveCredit({
  locationId,
  managerId,
  creditId,
  decision,
  note,
}) {
  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // only OPEN & not yet approved can be processed
    if (credit.status !== "OPEN" || credit.approvedAt) {
      const err = new Error("Credit already processed");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (decision === "REJECT") {
      // Cancel the sale if credit is rejected
      await tx
        .update(sales)
        .set({
          status: "CANCELED", // ✅ use one-L consistently
          canceledAt: new Date(),
          canceledBy: managerId,
          cancelReason: note || "Credit rejected",
          updatedAt: new Date(),
        })
        .where(
          and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
        );

      // Close the credit record
      await tx
        .update(credits)
        .set({
          status: "SETTLED",
          approvedBy: managerId,
          approvedAt: new Date(),
          settledBy: managerId,
          settledAt: new Date(),
          note: note || "Credit rejected (sale canceled)",
        })
        .where(
          and(eq(credits.id, creditId), eq(credits.locationId, locationId)),
        );

      await logAudit({
        userId: managerId,
        action: AUDIT.CREDIT_REJECT,
        entity: "credit",
        entityId: creditId,
        description: "Credit rejected (sale canceled)",
        meta: { decision: "REJECT", note },
      });

      return { ok: true, decision: "REJECT" };
    }

    // APPROVE
    await tx
      .update(credits)
      .set({
        approvedBy: managerId,
        approvedAt: new Date(),
        note: note || credit.note,
      })
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    await logAudit({
      userId: managerId,
      action: AUDIT.CREDIT_APPROVE,
      entity: "credit",
      entityId: creditId,
      description: "Credit approved",
      meta: { decision: "APPROVE", note },
    });

    return { ok: true, decision: "APPROVE" };
  });
}

async function settleCredit({
  locationId,
  cashierId,
  creditId,
  method,
  note,
  cashSessionId, // optional
}) {
  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (credit.status !== "OPEN") {
      const err = new Error("Credit not open");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (!credit.approvedAt) {
      const err = new Error("Credit must be approved first");
      err.code = "NOT_APPROVED";
      throw err;
    }

    // Ensure payment is not already recorded for sale (location-safe)
    const existingPay = await tx.execute(sql`
      SELECT id
      FROM payments
      WHERE sale_id = ${credit.saleId}
        AND location_id = ${locationId}
      LIMIT 1
    `);

    const payRows = existingPay.rows || existingPay;
    if (payRows.length > 0) {
      const err = new Error("Payment already recorded for this sale");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    const payMethod = normMethod(method);
    const csid = toNullableInt(cashSessionId);

    // Record payment
    const [payment] = await tx
      .insert(payments)
      .values({
        locationId,
        saleId: credit.saleId,
        cashierId,
        cashSessionId: csid,
        amount: credit.amount,
        method: payMethod,
        note: note || "Credit settlement",
      })
      .returning();

    // Mark sale completed
    await tx
      .update(sales)
      .set({
        status: "COMPLETED",
        updatedAt: new Date(),
      })
      .where(
        and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
      );

    // Ledger entry
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
      note: note || "Credit settlement",
    });

    // Close credit
    await tx
      .update(credits)
      .set({
        status: "SETTLED",
        settledBy: cashierId,
        settledAt: new Date(),
        note: note || credit.note,
      })
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    await logAudit({
      userId: cashierId,
      action: AUDIT.CREDIT_SETTLED,
      entity: "credit",
      entityId: creditId,
      description: "Credit settled",
      meta: { method: payMethod, amount: credit.amount, cashSessionId: csid },
    });

    return { ok: true, paymentId: payment.id };
  });
}

/**
 * Keeping these exports in case older code still imports them.
 * Your read routes currently use creditReadService (also fine).
 */
async function listOpenCredits({ locationId, q }) {
  const pattern = q ? `%${q}%` : null;

  if (!pattern) {
    const res = await db.execute(sql`
      SELECT
        c.id,
        c.sale_id as "saleId",
        c.customer_id as "customerId",
        c.amount,
        c.status,
        c.approved_at as "approvedAt",
        c.created_at as "createdAt"
      FROM credits c
      WHERE c.location_id = ${locationId}
        AND c.status = 'OPEN'
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
      c.amount,
      c.status,
      c.approved_at as "approvedAt",
      c.created_at as "createdAt",
      cu.name as "customerName",
      cu.phone as "customerPhone"
    FROM credits c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId}
      AND c.status = 'OPEN'
      AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  return res.rows || res;
}

async function getCreditBySale({ locationId, saleId }) {
  const res = await db.execute(sql`
    SELECT *
    FROM credits
    WHERE location_id = ${locationId}
      AND sale_id = ${saleId}
    LIMIT 1
  `);

  const rows = res.rows || res;
  return rows[0] || null;
}

module.exports = {
  createCredit,
  approveCredit,
  settleCredit,
  listOpenCredits,
  getCreditBySale,
};
