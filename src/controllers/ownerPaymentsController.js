"use strict";

const ownerPaymentsService = require("../services/ownerPaymentsService");

async function listOwnerPayments(request, reply) {
  try {
    const payments = await ownerPaymentsService.listOwnerPayments({
      locationId: request.query?.locationId || null,
      method: request.query?.method || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 50,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, payments });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerPayments failed");
    return reply.status(500).send({
      error: "Failed to load owner payments",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerPaymentsSummary(request, reply) {
  try {
    const summary = await ownerPaymentsService.getOwnerPaymentsSummary({
      locationId: request.query?.locationId || null,
      method: request.query?.method || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerPaymentsSummary failed");
    return reply.status(500).send({
      error: "Failed to load owner payments summary",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerPaymentsBreakdown(request, reply) {
  try {
    const breakdown = await ownerPaymentsService.getOwnerPaymentsBreakdown({
      locationId: request.query?.locationId || null,
      method: request.query?.method || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, breakdown });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerPaymentsBreakdown failed");
    return reply.status(500).send({
      error: "Failed to load owner payments breakdown",
      debug: e?.message || String(e),
    });
  }
}

module.exports = {
  listOwnerPayments,
  getOwnerPaymentsSummary,
  getOwnerPaymentsBreakdown,
};
