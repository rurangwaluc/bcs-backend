const { createCashTxSchema } = require("../validators/cash.schema");
const cashService = require("../services/cashService");
const ROLES = require("../permissions/roles");

function isCashier(user) {
  return String(user?.role || "").toUpperCase() === ROLES.CASHIER;
}

async function createCashTx(request, reply) {
  const parsed = createCashTxSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const tx = await cashService.createCashTx({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      method: parsed.data.method,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, tx });
  } catch (e) {
    request.log.error({ err: e }, "createCashTx failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listLedger(request, reply) {
  try {
    const limit = request.query.limit ? Number(request.query.limit) : 100;

    // ✅ cashier sees only their own ledger rows (safe default)
    const scopeCashierId = isCashier(request.user) ? request.user.id : null;

    const rows = await cashService.listLedger({
      locationId: request.user.locationId,
      cashierId: scopeCashierId,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
    });

    return reply.send({ ok: true, ledger: rows });
  } catch (e) {
    request.log.error({ err: e }, "listLedger failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function todaySummary(request, reply) {
  try {
    // ✅ cashier sees only their own ledger totals
    const scopeCashierId = isCashier(request.user) ? request.user.id : null;

    const summary = await cashService.summaryToday({
      locationId: request.user.locationId,
      cashierId: scopeCashierId,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "todaySummary failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createCashTx, listLedger, todaySummary };