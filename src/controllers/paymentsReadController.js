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
  const summary = await paymentsReadService.getPaymentsSummary({
    locationId: request.user.locationId,
  });

  return reply.send({ ok: true, summary });
}

module.exports = { listPayments, getPaymentsSummary };
