const {
  createCashReconcileSchema,
} = require("../validators/cashReconcile.schema");
const cashReconcileService = require("../services/cashReconcileService");

async function createCashReconcile(request, reply) {
  const parsed = createCashReconcileSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const out = await cashReconcileService.createReconcile({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      cashSessionId: parsed.data.cashSessionId,
      expectedCash: parsed.data.expectedCash,
      countedCash: parsed.data.countedCash,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, reconcile: out });
  } catch (e) {
    if (e.code === "SESSION_NOT_FOUND")
      return reply.status(404).send({ error: e.message });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listCashReconciles(request, reply) {
  try {
    const rows = await cashReconcileService.listReconciles({
      locationId: request.user.locationId,
    });

    return reply.send({ ok: true, reconciles: rows });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createCashReconcile, listCashReconciles };
