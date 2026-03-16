// backend/src/services/creditPaymentService.js
"use strict";

const { db } = require("../config/db");
const { sql, eq, and } = require("drizzle-orm");
const { creditPayments } = require("../db/schema/credit_payments.schema");
const { credits } = require("../db/schema/credits.schema");
const { sales } = require("../db/schema/sales.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { logAudit } = require("./auditService");
const notificationService = require("./notificationService");
const AUDIT = require("../audit/actions");

function toPositiveInt(v, code = "BAD_AMOUNT") {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error("Amount must be greater than zero");
    err.code = code;
    throw err;
  }
  return Math.round(n);
}

function normMethod(v) {
  return String(v || "CASH")
    .trim()
    .toUpperCase();
}

function toNullableInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function recordCreditPayment({
  locationId,
  cashierId,
  creditId,
  amount,
  method,
  note,
  reference,
  cashSessionId,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0)
    throw Object.assign(new Error("Invalid credit id"), {
      code: "BAD_CREDIT_ID",
    });

  const payAmount = toPositiveInt(amount, "BAD_AMOUNT");
  const payMethod = normMethod(method);
  const now = new Date();
  const cleanNote = note?.trim() || null;
  const cleanRef = reference?.trim() || null;

  return db.transaction(async (tx) => {
    // Fetch credit
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));
    const credit = creditRows[0];
    if (!credit)
      throw Object.assign(new Error("Credit not found"), { code: "NOT_FOUND" });

    if (
      !["APPROVED", "PARTIALLY_PAID"].includes(
        String(credit.status).toUpperCase(),
      )
    ) {
      throw Object.assign(new Error("Credit not approved for collection"), {
        code: "NOT_APPROVED",
      });
    }

    const remaining = Number(credit.remainingAmount || 0);
    if (payAmount > remaining)
      throw Object.assign(new Error("Payment exceeds remaining balance"), {
        code: "OVERPAYMENT",
      });

    let resolvedSessionId = toNullableInt(cashSessionId);
    if (payMethod === "CASH" && !resolvedSessionId) {
      const openSession = await tx.execute(sql`
        SELECT id FROM cash_sessions
        WHERE cashier_id = ${cashierId}
          AND location_id = ${locationId}
          AND status = 'OPEN'
        ORDER BY opened_at DESC
        LIMIT 1
      `);
      const rows = openSession.rows || openSession || [];
      if (rows.length === 0)
        throw Object.assign(new Error("No open cash session"), {
          code: "NO_OPEN_SESSION",
        });
      resolvedSessionId = Number(rows[0].id);
    }

    // Insert payment
    const [payment] = await tx
      .insert(creditPayments)
      .values({
        locationId,
        creditId: id,
        saleId: credit.saleId,
        amount: payAmount,
        method: payMethod,
        cashSessionId: resolvedSessionId,
        receivedBy: cashierId,
        reference: cleanRef,
        note: cleanNote,
        createdAt: now,
      })
      .returning();

    // Update credit totals
    const nextPaid = Number(credit.paidAmount || 0) + payAmount;
    const nextRemaining = Math.max(0, remaining - payAmount);
    const nextStatus = nextRemaining === 0 ? "SETTLED" : "PARTIALLY_PAID";

    await tx
      .update(credits)
      .set({
        paidAmount: nextPaid,
        remainingAmount: nextRemaining,
        status: nextStatus,
        settledBy: nextRemaining === 0 ? cashierId : credit.settledBy,
        settledAt: nextRemaining === 0 ? now : credit.settledAt,
        note: cleanNote || credit.note,
      })
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    // Update sale
    await tx
      .update(sales)
      .set({
        status: nextRemaining === 0 ? "COMPLETED" : "PENDING",
        updatedAt: now,
      })
      .where(
        and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
      );

    // Record in cash ledger
    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      cashSessionId: resolvedSessionId,
      type: "CREDIT_PAYMENT",
      direction: "IN",
      amount: payAmount,
      method: payMethod,
      reference: cleanRef,
      saleId: credit.saleId,
      creditId: id,
      creditPaymentId: payment.id,
      note: cleanNote || "Credit payment",
      createdAt: now,
    });

    await logAudit({
      locationId,
      userId: cashierId,
      action: AUDIT.CREDIT_SETTLED,
      entity: "credit",
      entityId: id,
      description:
        nextRemaining === 0
          ? "Credit fully settled"
          : "Credit partial payment recorded",
      meta: {
        saleId: credit.saleId,
        creditPaymentId: payment.id,
        amount: payAmount,
        remainingAmount: nextRemaining,
      },
    });

    await notificationService.createNotification({
      locationId,
      recipientUserId: Number(credit.createdBy),
      actorUserId: cashierId,
      type:
        nextRemaining === 0
          ? "CREDIT_SETTLED"
          : "CREDIT_PARTIAL_PAYMENT_RECORDED",
      title:
        nextRemaining === 0
          ? `Credit settled (Sale #${credit.saleId})`
          : `Credit payment recorded (Sale #${credit.saleId})`,
      body: `Amount: ${payAmount}, Remaining: ${nextRemaining}`,
      priority: "normal",
      entity: "credit",
      entityId: id,
      tx,
    });

    return {
      creditId: id,
      creditPaymentId: payment.id,
      saleId: credit.saleId,
      amountRecorded: payAmount,
      paidAmount: nextPaid,
      remainingAmount: nextRemaining,
      status: nextStatus,
    };
  });
}

async function listPayments({ locationId, creditId }) {
  const res = await db
    .select()
    .from(creditPayments)
    .where(
      and(
        eq(creditPayments.locationId, locationId),
        eq(creditPayments.creditId, creditId),
      ),
    )
    .orderBy("id", "asc")
    .all();

  return res;
}

module.exports = { recordCreditPayment, listPayments };
