// backend/src/controllers/creditController.js

const {
  createCreditSchema,
  approveCreditSchema, // this must validate { decision, note? }
  settleCreditSchema, // this must validate { method, note?, cashSessionId? }
} = require("../validators/credit.schema");

const creditService = require("../services/creditService");

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * POST /credits
 * Seller creates credit request from a sale.
 * Body: { saleId, note? }
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
      note: parsed.data.note,
    });

    return reply.send({ ok: true, credit });
  } catch (e) {
    request.log.error({ err: e }, "createCredit failed");

    if (e.code === "SALE_NOT_FOUND")
      return reply.status(404).send({ error: "Sale not found" });

    if (e.code === "BAD_STATUS")
      return reply.status(409).send({
        error: e.message || "Sale cannot create credit from current status",
        debug: e.debug,
      });

    if (e.code === "MISSING_CUSTOMER")
      return reply.status(409).send({ error: e.message });

    if (e.code === "DUPLICATE_CREDIT")
      return reply.status(409).send({ error: e.message });

    if (e.code === "DUPLICATE_PAYMENT")
      return reply.status(409).send({ error: e.message });

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

/**
 * PATCH /credits/:id/decision
 * Manager/Admin approves or rejects.
 * Body: { decision: "APPROVE"|"REJECT", note? }
 */
async function approveCredit(request, reply) {
  const creditId = toInt(request.params.id, null);
  if (!creditId) return reply.status(400).send({ error: "Invalid credit id" });

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

    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Credit not found" });

    if (e.code === "BAD_STATUS")
      return reply.status(409).send({ error: e.message, debug: e.debug });

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

/**
 * PATCH /credits/:id/settle
 * Cashier/Admin settles an APPROVED credit.
 * Body: { method, note?, cashSessionId? }
 */
async function settleCredit(request, reply) {
  const creditId = toInt(request.params.id, null);
  if (!creditId) return reply.status(400).send({ error: "Invalid credit id" });

  const parsed = settleCreditSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await creditService.settleCredit({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      creditId,
      method: parsed.data.method,
      note: parsed.data.note,
      cashSessionId: parsed.data.cashSessionId,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "settleCredit failed");

    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Credit not found" });

    if (e.code === "NOT_APPROVED")
      return reply.status(409).send({ error: e.message, debug: e.debug });

    if (e.code === "DUPLICATE_PAYMENT")
      return reply.status(409).send({ error: e.message });

    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

module.exports = { createCredit, approveCredit, settleCredit };
