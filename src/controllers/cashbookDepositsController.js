const {
  createDepositSchema,
} = require("../validators/cashbookDeposits.schema");
const depositsService = require("../services/cashbookDepositsService");

async function createDeposit(request, reply) {
  const parsed = createDepositSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const deposit = await depositsService.createDeposit({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      cashSessionId: parsed.data.cashSessionId,
      method: parsed.data.method,
      amount: parsed.data.amount,
      reference: parsed.data.reference,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, deposit });
  } catch (e) {
    if (e.code === "SESSION_NOT_FOUND")
      return reply.status(404).send({ error: e.message });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listDeposits(request, reply) {
  try {
    const deposits = await depositsService.listDeposits({
      locationId: request.user.locationId,
    });

    return reply.send({ ok: true, deposits });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createDeposit, listDeposits };
