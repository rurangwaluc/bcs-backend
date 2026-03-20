"use strict";

const {
  createRefundSchema,
  listRefundsQuerySchema,
} = require("../validators/refunds.schema");
const refundsService = require("../services/refundsService");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function parseIsoDateStart(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseIsoDateEndExclusive(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function createRefund(request, reply) {
  const parsed = createRefundSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const isOwner = normalizeRole(request.user?.role) === "owner";
  const effectiveLocationId = isOwner
    ? parsed.data.locationId || request.user.locationId
    : request.user.locationId;

  try {
    const out = await refundsService.createRefund({
      locationId: effectiveLocationId,
      userId: request.user.id,
      saleId: parsed.data.saleId,
      reason: parsed.data.reason,
      method: parsed.data.method,
      reference: parsed.data.reference,
      items: parsed.data.items,
    });

    return reply.send({
      ok: true,
      refund: out.refund,
      sale: out.sale,
    });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Sale not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({
        error: "Sale not refundable",
        debug: e.debug,
      });
    }

    if (e.code === "NO_PAYMENT") {
      return reply.status(409).send({
        error: "Cannot refund: no payment found for this sale",
      });
    }

    if (e.code === "NO_OPEN_SESSION") {
      return reply.status(409).send({
        error: "No open cash session",
      });
    }

    if (e.code === "BAD_ITEMS") {
      return reply.status(400).send({
        error: e.message,
        debug: e.debug,
      });
    }

    request.log.error({ err: e }, "createRefund failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listRefunds(request, reply) {
  const parsed = listRefundsQuerySchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner
      ? (parsed.data.locationId ?? null)
      : request.user.locationId;

    const result = await refundsService.listRefunds({
      locationId: effectiveLocationId,
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
      saleId: parsed.data.saleId ?? null,
      method: parsed.data.method ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
    });

    console.log("[REFUNDS][LIST]", {
      role: request.user?.role,
      userId: request.user?.id,
      requestLocationId: request.user?.locationId ?? null,
      effectiveLocationId,
      query: parsed.data,
      count: Array.isArray(result?.rows) ? result.rows.length : -1,
      nextCursor: result?.nextCursor ?? null,
      firstRow: result?.rows?.[0] || null,
    });

    return reply.send({
      ok: true,
      refunds: result.rows,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listRefunds failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getRefundById(request, reply) {
  const refundId = Number(request.params?.id);
  if (!Number.isInteger(refundId) || refundId <= 0) {
    return reply.status(400).send({ error: "Invalid refund id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await refundsService.getRefundById({
      refundId,
      locationId: effectiveLocationId,
    });

    console.log("[REFUNDS][DETAIL]", {
      role: request.user?.role,
      userId: request.user?.id,
      requestLocationId: request.user?.locationId ?? null,
      effectiveLocationId,
      refundId,
      found: !!out,
      refund: out?.refund || null,
      itemsCount: Array.isArray(out?.items) ? out.items.length : 0,
      firstItem: out?.items?.[0] || null,
    });

    if (!out) {
      return reply.status(404).send({ error: "Refund not found" });
    }

    return reply.send({
      ok: true,
      refund: out.refund,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getRefundById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createRefund,
  listRefunds,
  getRefundById,
};
