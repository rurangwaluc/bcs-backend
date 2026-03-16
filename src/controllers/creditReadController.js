"use strict";

const creditReadService = require("../services/creditReadService");
const creditService = require("../services/creditService");

/**
 * GET /credits?status=&q=&limit=&cursor=
 */
async function listCredits(request, reply) {
  const { status, q, limit, cursor } = request.query || {};

  try {
    const out = await creditReadService.listCredits({
      locationId: request.user.locationId,
      status: status ? String(status).trim().toUpperCase() : "",
      q: q ? String(q) : "",
      limit: limit != null ? Number(limit) : 50,
      cursor: cursor != null ? cursor : null,
    });

    return reply.send(out);
  } catch (e) {
    request.log.error({ err: e }, "listCredits failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * GET /credits/:id
 */
async function getCredit(request, reply) {
  const creditId = Number(request.params.id);

  if (!Number.isInteger(creditId) || creditId <= 0) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  try {
    const credit = await creditReadService.getCreditById({
      locationId: request.user.locationId,
      creditId,
    });

    if (!credit) {
      return reply.status(404).send({ error: "Credit not found" });
    }

    return reply.send({ ok: true, credit });
  } catch (e) {
    request.log.error({ err: e }, "getCredit failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * GET /credits/open
 */
async function listOpenCredits(request, reply) {
  const q = request.query?.q ? String(request.query.q) : "";

  try {
    const rows = await creditService.listOpenCredits({
      locationId: request.user.locationId,
      q,
    });

    return reply.send({ ok: true, credits: rows });
  } catch (e) {
    request.log.error({ err: e }, "listOpenCredits failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  listCredits,
  getCredit,
  listOpenCredits,
};
