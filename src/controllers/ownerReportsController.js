"use strict";

const ownerReportsService = require("../services/ownerReportsService");

async function getOwnerReportsOverview(request, reply) {
  try {
    const overview = await ownerReportsService.getOwnerReportsOverview({
      locationId: request.query?.locationId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, overview });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerReportsOverview failed");
    return reply.status(500).send({
      error: "Failed to load owner reports overview",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerBranchPerformance(request, reply) {
  try {
    const rows = await ownerReportsService.getOwnerBranchPerformance({
      locationId: request.query?.locationId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, branches: rows });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerBranchPerformance failed");
    return reply.status(500).send({
      error: "Failed to load owner branch performance",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerFinancialSummary(request, reply) {
  try {
    const summary = await ownerReportsService.getOwnerFinancialSummary({
      locationId: request.query?.locationId || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerFinancialSummary failed");
    return reply.status(500).send({
      error: "Failed to load owner financial summary",
      debug: e?.message || String(e),
    });
  }
}

module.exports = {
  getOwnerReportsOverview,
  getOwnerBranchPerformance,
  getOwnerFinancialSummary,
};
