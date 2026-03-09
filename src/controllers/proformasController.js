"use strict";

const {
  createProformaSchema,
  listProformasQuerySchema,
} = require("../validators/proformas.schema");

const proformasService = require("../services/proformasService");

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

async function createProforma(request, reply) {
  const parsed = createProformaSchema.safeParse(request.body || {});
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
    const out = await proformasService.createProforma({
      actorUser: request.user,
      locationId: effectiveLocationId,
      payload: parsed.data,
    });

    return reply.send({
      ok: true,
      proforma: out.proforma,
      items: out.items,
    });
  } catch (e) {
    if (e.code === "BAD_ITEMS") {
      return reply.status(400).send({ error: e.message });
    }

    request.log.error({ err: e }, "createProforma failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listProformas(request, reply) {
  const parsed = listProformasQuerySchema.safeParse(request.query || {});
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

    const out = await proformasService.listProformas({
      locationId: effectiveLocationId,
      customerId: parsed.data.customerId ?? null,
      status: parsed.data.status ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
    });

    return reply.send({
      ok: true,
      proformas: out.rows,
      nextCursor: out.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listProformas failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getProformaById(request, reply) {
  const id = Number(request.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid proforma id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await proformasService.getProformaById({
      proformaId: id,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Proforma not found" });
    }

    return reply.send({
      ok: true,
      proforma: out.proforma,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getProformaById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function renderProforma(request, reply) {
  const id = Number(request.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid proforma id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await proformasService.renderProformaDocument({
      proformaId: id,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Proforma not found" });
    }

    reply.type("text/html; charset=utf-8");
    return reply.send(out.html);
  } catch (e) {
    request.log.error({ err: e }, "renderProforma failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createProforma,
  listProformas,
  getProformaById,
  renderProforma,
};
