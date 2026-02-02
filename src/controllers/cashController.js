const { createCashTxSchema } = require("../validators/cash.schema");
const cashService = require("../services/cashService");

async function createCashTx(request, reply) {
  const parsed = createCashTxSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const tx = await cashService.createCashTx({
    locationId: request.user.locationId,
    cashierId: request.user.id,
    type: parsed.data.type,
    amount: parsed.data.amount,
    method: parsed.data.method,
    note: parsed.data.note
  });

  return reply.send({ ok: true, tx });
}

async function listLedger(request, reply) {
  const limit = request.query.limit ? Number(request.query.limit) : 100;
  const rows = await cashService.listLedger({
    locationId: request.user.locationId,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100
  });

  return reply.send({ ok: true, ledger: rows });
}

async function todaySummary(request, reply) {
  const summary = await cashService.summaryToday({
    locationId: request.user.locationId
  });

  return reply.send({ ok: true, summary });
}

module.exports = { createCashTx, listLedger, todaySummary };
