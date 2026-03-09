"use strict";

const {
  createDeliveryNoteSchema,
  listDeliveryNotesQuerySchema,
} = require("../validators/deliveryNotes.schema");

const deliveryNotesService = require("../services/deliveryNotesService");

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

async function createDeliveryNote(request, reply) {
  const parsed = createDeliveryNoteSchema.safeParse(request.body || {});
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
    const out = await deliveryNotesService.createDeliveryNote({
      actorUser: request.user,
      locationId: effectiveLocationId,
      payload: parsed.data,
    });

    return reply.send({
      ok: true,
      deliveryNote: out.deliveryNote,
      items: out.items,
    });
  } catch (e) {
    if (
      ["NOT_FOUND", "BAD_STATUS", "BAD_ITEMS", "ALREADY_EXISTS"].includes(
        e.code,
      )
    ) {
      return reply.status(e.code === "NOT_FOUND" ? 404 : 409).send({
        error: e.message,
      });
    }

    request.log.error({ err: e }, "createDeliveryNote failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listDeliveryNotes(request, reply) {
  const parsed = listDeliveryNotesQuerySchema.safeParse(request.query || {});
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

    const out = await deliveryNotesService.listDeliveryNotes({
      locationId: effectiveLocationId,
      saleId: parsed.data.saleId ?? null,
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
      deliveryNotes: out.rows,
      nextCursor: out.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listDeliveryNotes failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getDeliveryNoteById(request, reply) {
  const id = Number(request.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid delivery note id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await deliveryNotesService.getDeliveryNoteById({
      deliveryNoteId: id,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Delivery note not found" });
    }

    return reply.send({
      ok: true,
      deliveryNote: out.deliveryNote,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getDeliveryNoteById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function renderDeliveryNote(request, reply) {
  const id = Number(request.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid delivery note id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await deliveryNotesService.renderDeliveryNoteDocument({
      deliveryNoteId: id,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Delivery note not found" });
    }

    reply.type("text/html; charset=utf-8");
    return reply.send(out.html);
  } catch (e) {
    request.log.error({ err: e }, "renderDeliveryNote failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createDeliveryNote,
  listDeliveryNotes,
  getDeliveryNoteById,
  renderDeliveryNote,
};
