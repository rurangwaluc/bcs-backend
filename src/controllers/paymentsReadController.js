// backend/src/controllers/paymentsReadController.js
const { z } = require("zod");
const paymentsReadService = require("../services/paymentsReadService");

const listPaymentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

async function listPayments(request, reply) {
  const parsed = listPaymentsQuerySchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: parsed.error.flatten() });
  }

  const { limit = 100, offset = 0 } = parsed.data;

  try {
    const rows = await paymentsReadService.listPayments({
      locationId: request.user.locationId,
      limit,
      offset,
    });
    return reply.send({ ok: true, payments: rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to load payments",
      debug: e?.debug || e?.message || String(e),
    });
  }
}

async function getPaymentsSummary(request, reply) {
  try {
    const summary = await paymentsReadService.getPaymentsSummary({
      locationId: request.user.locationId,
    });
    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to load summary",
      debug: e?.debug || e?.message || String(e),
    });
  }
}

async function getPaymentsBreakdown(request, reply) {
  try {
    const breakdown = await paymentsReadService.getPaymentsBreakdown({
      locationId: request.user.locationId,
    });
    return reply.send({ ok: true, breakdown });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({
      error: "Failed to load breakdown",
      debug: e?.debug || e?.message || String(e),
    });
  }
}

module.exports = {
  listPayments,
  getPaymentsSummary,
  getPaymentsBreakdown,
};
