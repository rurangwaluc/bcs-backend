"use strict";

const {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
} = require("../validators/inventory.arrivals.schema");
const inventoryArrivalsService = require("../services/inventoryArrivalsService");

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

async function createInventoryArrival(request, reply) {
  const parsed = createInventoryArrivalSchema.safeParse(request.body || {});
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
    const out = await inventoryArrivalsService.createInventoryArrival({
      request,
      actorUser: request.user,
      locationId: effectiveLocationId,
      supplierId: parsed.data.supplierId,
      reference: parsed.data.reference,
      documentNo: parsed.data.documentNo,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      notes: parsed.data.notes,
      receivedAt: parsed.data.receivedAt,
      items: parsed.data.items,
    });

    return reply.send({
      ok: true,
      arrival: out.arrival,
      items: out.items,
    });
  } catch (e) {
    if (
      [
        "LOCATION_NOT_FOUND",
        "SUPPLIER_NOT_FOUND",
        "PRODUCT_NOT_FOUND",
      ].includes(e.code)
    ) {
      return reply.status(404).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    if (
      ["LOCATION_NOT_ACTIVE", "PRODUCT_ARCHIVED", "BAD_ITEMS"].includes(e.code)
    ) {
      return reply.status(400).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    request.log.error({ err: e }, "createInventoryArrival failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listInventoryArrivals(request, reply) {
  const parsed = listInventoryArrivalsQuerySchema.safeParse(
    request.query || {},
  );
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

    const result = await inventoryArrivalsService.listInventoryArrivals({
      locationId: effectiveLocationId,
      supplierId: parsed.data.supplierId ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
    });

    return reply.send({
      ok: true,
      arrivals: result.rows,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listInventoryArrivals failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getInventoryArrivalById(request, reply) {
  const arrivalId = Number(request.params?.id);
  if (!Number.isInteger(arrivalId) || arrivalId <= 0) {
    return reply.status(400).send({ error: "Invalid arrival id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await inventoryArrivalsService.getInventoryArrivalById({
      arrivalId,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Arrival not found" });
    }

    return reply.send({
      ok: true,
      arrival: out.arrival,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getInventoryArrivalById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createInventoryArrival,
  listInventoryArrivals,
  getInventoryArrivalById,
};
