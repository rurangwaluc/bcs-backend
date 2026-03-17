"use strict";

const {
  createCreditSchema,
  approveCreditSchema,
  recordCreditPaymentSchema,
} = require("../validators/credit.schema");

const creditService = require("../services/creditService");

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * POST /credits
 */
async function createCredit(request, reply) {
  const parsed = createCreditSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const credit = await creditService.createCredit({
      locationId: request.user.locationId,
      sellerId: request.user.id,
      saleId: parsed.data.saleId,
      creditMode: parsed.data.creditMode,
      dueDate: parsed.data.dueDate,
      note: parsed.data.note,
      installments: parsed.data.installments,
      installmentCount: parsed.data.installmentCount,
      installmentAmount: parsed.data.installmentAmount,
      firstInstallmentDate: parsed.data.firstInstallmentDate,
    });

    return reply.send({ ok: true, credit });
  } catch (e) {
    request.log.error({ err: e }, "createCredit failed");

    if (e.code === "BAD_SALE_ID") {
      return reply.status(400).send({ error: "Invalid sale id" });
    }

    if (e.code === "SALE_NOT_FOUND") {
      return reply.status(404).send({ error: "Sale not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({
        error: e.message || "Sale cannot create credit from current status",
        debug: e.debug,
      });
    }

    if (e.code === "MISSING_CUSTOMER") {
      return reply.status(409).send({ error: e.message });
    }

    if (e.code === "CUSTOMER_NOT_FOUND") {
      return reply.status(404).send({
        error: "Customer not found for this sale",
        debug: e.debug,
      });
    }

    if (
      e.code === "BAD_INSTALLMENTS" ||
      e.code === "INSTALLMENT_SUM_MISMATCH" ||
      e.code === "BAD_CREDIT_MODE" ||
      e.code === "BAD_INSTALLMENT_PLAN"
    ) {
      return reply.status(400).send({
        error: e.message || "Invalid installment plan",
        debug: e.debug,
      });
    }

    if (e.code === "DUPLICATE_CREDIT") {
      return reply.status(409).send({ error: e.message });
    }

    if (e.code === "DUPLICATE_PAYMENT") {
      return reply.status(409).send({ error: e.message });
    }

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

/**
 * PATCH /credits/:id/decision
 */
async function approveCredit(request, reply) {
  const creditId = toInt(request.params.id, null);
  if (!creditId) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  const parsed = approveCreditSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await creditService.approveCredit({
      locationId: request.user.locationId,
      managerId: request.user.id,
      creditId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "approveCredit failed");

    if (e.code === "BAD_CREDIT_ID") {
      return reply.status(400).send({ error: "Invalid credit id" });
    }

    if (e.code === "BAD_DECISION") {
      return reply.status(400).send({
        error: e.message || "Invalid decision",
        debug: e.debug,
      });
    }

    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Credit not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({
        error: e.message || "Credit cannot be processed from current status",
        debug: e.debug,
      });
    }

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

/**
 * PATCH /credits/:id/payment
 */
async function recordCreditPayment(request, reply) {
  const creditId = toInt(request.params.id, null);
  if (!creditId) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  const parsed = recordCreditPaymentSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await creditService.recordCreditPayment({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      creditId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      note: parsed.data.note,
      reference: parsed.data.reference,
      cashSessionId: parsed.data.cashSessionId,
      installmentId: parsed.data.installmentId,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "recordCreditPayment failed");

    if (e.code === "BAD_CREDIT_ID") {
      return reply.status(400).send({ error: "Invalid credit id" });
    }

    if (e.code === "BAD_AMOUNT") {
      return reply.status(400).send({
        error: e.message || "Invalid amount",
        debug: e.debug,
      });
    }

    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Credit not found" });
    }

    if (e.code === "BAD_STATUS" || e.code === "NOT_APPROVED") {
      return reply.status(409).send({
        error: e.message || "Credit is not yet approved for collection",
        debug: e.debug,
      });
    }

    if (e.code === "INSTALLMENT_NOT_FOUND") {
      return reply.status(404).send({
        error: e.message || "Installment not found",
        debug: e.debug,
      });
    }

    if (e.code === "INSTALLMENT_OVERPAYMENT") {
      return reply.status(409).send({
        error:
          e.message ||
          "Installment payment exceeds active installment remaining",
        debug: e.debug,
      });
    }

    if (e.code === "OVERPAYMENT") {
      return reply.status(409).send({
        error: e.message || "Payment exceeds remaining balance",
        debug: e.debug,
      });
    }

    if (e.code === "NO_OPEN_SESSION") {
      return reply.status(409).send({
        error: "No open cash session",
      });
    }

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

const settleCredit = recordCreditPayment;

module.exports = {
  createCredit,
  approveCredit,
  recordCreditPayment,
  settleCredit,
};
