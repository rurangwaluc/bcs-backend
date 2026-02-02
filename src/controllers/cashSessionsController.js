const {
  openCashSessionSchema,
  closeCashSessionSchema,
} = require("../validators/cashSessions.schema");
const cashSessionsService = require("../services/cashSessionsService");

async function openCashSession(request, reply) {
  const parsed = openCashSessionSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const session = await cashSessionsService.openSession({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      openingBalance: parsed.data.openingBalance,
    });

    return reply.send({ ok: true, session });
  } catch (e) {
    if (e.code === "SESSION_ALREADY_OPEN")
      return reply.status(409).send({ error: e.message });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function closeCashSession(request, reply) {
  const sessionId = Number(request.params.id);
  const parsed = closeCashSessionSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const session = await cashSessionsService.closeSession({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      sessionId,
      closingBalance: parsed.data.closingBalance,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, session });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: e.message });
    if (e.code === "FORBIDDEN")
      return reply.status(403).send({ error: "Forbidden" });
    if (e.code === "BAD_STATUS")
      return reply.status(409).send({ error: e.message });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listMyCashSessions(request, reply) {
  try {
    const sessions = await cashSessionsService.listMySessions({
      locationId: request.user.locationId,
      cashierId: request.user.id,
    });

    return reply.send({ ok: true, sessions });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { openCashSession, closeCashSession, listMyCashSessions };
