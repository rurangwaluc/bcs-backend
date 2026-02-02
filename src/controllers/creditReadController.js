// backend/src/controllers/creditReadController.js

const creditReadService = require("../services/creditReadService");

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

async function getCredit(request, reply) {
  const id = toInt(request.params.id, null);
  if (!id) return reply.status(400).send({ error: "Invalid credit id" });

  const credit = await creditReadService.getCreditById({
    locationId: request.user.locationId,
    creditId: id,
  });

  if (!credit) return reply.status(404).send({ error: "Credit not found" });
  return reply.send({ ok: true, credit });
}

async function listCredits(request, reply) {
  const status = request.query?.status ? String(request.query.status) : null; // OPEN / SETTLED
  const q = request.query?.q ? String(request.query.q).trim() : null;

  const limit = Math.min(200, Math.max(1, Number(request.query?.limit || 50)));
  const cursor = toInt(request.query?.cursor, null);

  const result = await creditReadService.listCredits({
    locationId: request.user.locationId,
    status,
    q,
    limit,
    cursor,
  });

  return reply.send({
    ok: true,
    rows: result.rows,
    nextCursor: result.nextCursor,
  });
}

async function listOpenCredits(request, reply) {
  const q = request.query?.q ? String(request.query.q).trim() : null;
  const limit = Math.min(200, Math.max(1, Number(request.query?.limit || 50)));
  const cursor = toInt(request.query?.cursor, null);

  const result = await creditReadService.listCredits({
    locationId: request.user.locationId,
    status: "OPEN",
    q,
    limit,
    cursor,
  });

  return reply.send({
    ok: true,
    rows: result.rows,
    nextCursor: result.nextCursor,
  });
}

module.exports = { getCredit, listCredits, listOpenCredits };
