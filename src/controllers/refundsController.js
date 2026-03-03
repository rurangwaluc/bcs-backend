// backend/src/controllers/refundsController.js

const { createRefundSchema } = require("../validators/refunds.schema");
const refundsService = require("../services/refundsService");

async function createRefund(request, reply) {
  const parsed = createRefundSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const out = await refundsService.createRefund({
      locationId: request.user.locationId,
      userId: request.user.id,
      saleId: parsed.data.saleId,
      reason: parsed.data.reason,
      method: parsed.data.method,
      reference: parsed.data.reference,
      items: parsed.data.items,
    });

    return reply.send({ ok: true, refund: out.refund, sale: out.sale });
  } catch (e) {
    if (e.code === "NOT_FOUND") return reply.status(404).send({ error: "Sale not found" });
    if (e.code === "BAD_STATUS") return reply.status(409).send({ error: "Sale not refundable", debug: e.debug });
    if (e.code === "NO_PAYMENT") return reply.status(409).send({ error: "Cannot refund: no payment found for this sale" });
    if (e.code === "NO_OPEN_SESSION") return reply.status(409).send({ error: "No open cash session" });
    if (e.code === "BAD_ITEMS") return reply.status(400).send({ error: e.message, debug: e.debug });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listRefunds(request, reply) {
  try {
    const rows = await refundsService.listRefunds({ locationId: request.user.locationId });
    return reply.send({ ok: true, refunds: rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createRefund, listRefunds };