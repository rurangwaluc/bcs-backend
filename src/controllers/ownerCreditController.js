"use strict";

const {
  approveCreditSchema,
  settleCreditSchema,
} = require("../validators/credit.schema");

const ownerCreditService = require("../services/ownerCreditService");

async function getOwnerCreditsSummary(request, reply) {
  try {
    const summary = await ownerCreditService.getOwnerCreditsSummary({
      locationId: request.query?.locationId || null,
      status: request.query?.status || null,
      q: request.query?.q || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerCreditsSummary failed");
    return reply.status(500).send({
      error: "Failed to load owner credits summary",
      debug: e?.message || String(e),
    });
  }
}

async function listOwnerCredits(request, reply) {
  try {
    const out = await ownerCreditService.listOwnerCredits({
      locationId: request.query?.locationId || null,
      status: request.query?.status || null,
      q: request.query?.q || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 50,
      cursor: request.query?.cursor || null,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerCredits failed");
    return reply.status(500).send({
      error: "Failed to load owner credits",
      debug: e?.message || String(e),
    });
  }
}

async function getOwnerCredit(request, reply) {
  const creditId = Number(request.params.id);
  if (!Number.isInteger(creditId) || creditId <= 0) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  try {
    const credit = await ownerCreditService.getOwnerCreditById({ creditId });
    if (!credit) {
      return reply.status(404).send({ error: "Credit not found" });
    }

    return reply.send({ ok: true, credit });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerCredit failed");
    return reply.status(500).send({
      error: "Failed to load owner credit",
      debug: e?.message || String(e),
    });
  }
}

async function ownerDecideCredit(request, reply) {
  const creditId = Number(request.params.id);
  if (!Number.isInteger(creditId) || creditId <= 0) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  const parsed = approveCreditSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await ownerCreditService.ownerDecideCredit({
      actorUserId: request.user.id,
      creditId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Credit not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({ error: e.message, debug: e.debug });
    }

    request.log.error({ err: e }, "ownerDecideCredit failed");
    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

async function ownerSettleCredit(request, reply) {
  const creditId = Number(request.params.id);
  if (!Number.isInteger(creditId) || creditId <= 0) {
    return reply.status(400).send({ error: "Invalid credit id" });
  }

  const parsed = settleCreditSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await ownerCreditService.ownerSettleCredit({
      actorUserId: request.user.id,
      creditId,
      method: parsed.data.method,
      note: parsed.data.note,
      cashSessionId: parsed.data.cashSessionId,
    });

    return reply.send({ ok: true, ...out });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Credit not found" });
    }

    if (e.code === "NOT_APPROVED") {
      return reply.status(409).send({ error: e.message, debug: e.debug });
    }

    if (e.code === "DUPLICATE_PAYMENT") {
      return reply.status(409).send({ error: e.message });
    }

    if (e.code === "NO_OPEN_SESSION") {
      return reply.status(409).send({ error: "No open cash session" });
    }

    request.log.error({ err: e }, "ownerSettleCredit failed");
    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

module.exports = {
  getOwnerCreditsSummary,
  listOwnerCredits,
  getOwnerCredit,
  ownerDecideCredit,
  ownerSettleCredit,
};
