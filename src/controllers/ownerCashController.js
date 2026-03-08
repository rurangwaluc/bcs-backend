"use strict";

const ownerCashService = require("../services/ownerCashService");

async function getOwnerCashSummary(request, reply) {
  try {
    const summary = await ownerCashService.getOwnerCashSummary({
      locationId: request.query?.locationId || null,
      method: request.query?.method || null,
      direction: request.query?.direction || null,
      type: request.query?.type || null,
      cashierId: request.query?.cashierId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerCashSummary failed");
    return reply.status(500).send({
      error: "Failed to load owner cash summary",
      debug: e?.message || String(e),
    });
  }
}

async function listOwnerCashLedger(request, reply) {
  try {
    const rows = await ownerCashService.listOwnerCashLedger({
      locationId: request.query?.locationId || null,
      method: request.query?.method || null,
      direction: request.query?.direction || null,
      type: request.query?.type || null,
      cashierId: request.query?.cashierId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 100,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, ledger: rows });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerCashLedger failed");
    return reply.status(500).send({
      error: "Failed to load owner cash ledger",
      debug: e?.message || String(e),
    });
  }
}

async function listOwnerCashSessions(request, reply) {
  try {
    const out = await ownerCashService.listOwnerCashSessions({
      locationId: request.query?.locationId || null,
      cashierId: request.query?.cashierId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 100,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerCashSessions failed");
    return reply.status(500).send({
      error: "Failed to load owner cash sessions",
      debug: e?.message || String(e),
    });
  }
}

async function listOwnerCashRefunds(request, reply) {
  try {
    const out = await ownerCashService.listOwnerCashRefunds({
      locationId: request.query?.locationId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 100,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerCashRefunds failed");
    return reply.status(500).send({
      error: "Failed to load owner cash refunds",
      debug: e?.message || String(e),
    });
  }
}

module.exports = {
  getOwnerCashSummary,
  listOwnerCashLedger,
  listOwnerCashSessions,
  listOwnerCashRefunds,
};
