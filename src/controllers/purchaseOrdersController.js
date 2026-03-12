"use strict";

const {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  approvePurchaseOrderSchema,
  cancelPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
} = require("../validators/purchaseorders.schema");

const purchaseOrdersService = require("../services/purchaseOrdersService");

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

async function createPurchaseOrder(request, reply) {
  const parsed = createPurchaseOrderSchema.safeParse(request.body || {});
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
    const out = await purchaseOrdersService.createPurchaseOrder({
      actorUser: request.user,
      locationId: effectiveLocationId,
      supplierId: parsed.data.supplierId,
      poNo: parsed.data.poNo,
      reference: parsed.data.reference,
      currency: parsed.data.currency,
      notes: parsed.data.notes,
      orderedAt: parsed.data.orderedAt,
      expectedAt: parsed.data.expectedAt,
      items: parsed.data.items,
    });

    return reply.send({
      ok: true,
      purchaseOrder: out.purchaseOrder,
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

    if (["PRODUCT_ARCHIVED", "BAD_ITEMS"].includes(e.code)) {
      return reply.status(400).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    request.log.error({ err: e }, "createPurchaseOrder failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updatePurchaseOrder(request, reply) {
  const purchaseOrderId = Number(request.params?.id);
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return reply.status(400).send({ error: "Invalid purchase order id" });
  }

  const parsed = updatePurchaseOrderSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await purchaseOrdersService.updatePurchaseOrder({
      actorUser: request.user,
      purchaseOrderId,
      supplierId: parsed.data.supplierId,
      poNo: parsed.data.poNo,
      reference: parsed.data.reference,
      currency: parsed.data.currency,
      notes: parsed.data.notes,
      orderedAt: parsed.data.orderedAt,
      expectedAt: parsed.data.expectedAt,
      items: parsed.data.items,
    });

    return reply.send({
      ok: true,
      purchaseOrder: out.purchaseOrder,
      items: out.items,
    });
  } catch (e) {
    if (
      ["NOT_FOUND", "SUPPLIER_NOT_FOUND", "PRODUCT_NOT_FOUND"].includes(e.code)
    ) {
      return reply.status(404).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    if (
      [
        "STATUS_LOCKED",
        "LINES_LOCKED",
        "PRODUCT_ARCHIVED",
        "BAD_ITEMS",
      ].includes(e.code)
    ) {
      return reply.status(400).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    request.log.error({ err: e }, "updatePurchaseOrder failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function approvePurchaseOrder(request, reply) {
  const purchaseOrderId = Number(request.params?.id);
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return reply.status(400).send({ error: "Invalid purchase order id" });
  }

  const parsed = approvePurchaseOrderSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await purchaseOrdersService.approvePurchaseOrder({
      actorUser: request.user,
      purchaseOrderId,
    });

    return reply.send({
      ok: true,
      purchaseOrder: out.purchaseOrder,
      items: out.items,
    });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: e.message });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({ error: e.message });
    }

    request.log.error({ err: e }, "approvePurchaseOrder failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function cancelPurchaseOrder(request, reply) {
  const purchaseOrderId = Number(request.params?.id);
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return reply.status(400).send({ error: "Invalid purchase order id" });
  }

  const parsed = cancelPurchaseOrderSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await purchaseOrdersService.cancelPurchaseOrder({
      actorUser: request.user,
      purchaseOrderId,
      reason: parsed.data.reason,
    });

    return reply.send({
      ok: true,
      purchaseOrder: out.purchaseOrder,
      items: out.items,
    });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: e.message });
    }

    if (["BAD_STATUS", "HAS_RECEIPTS"].includes(e.code)) {
      return reply.status(409).send({ error: e.message });
    }

    request.log.error({ err: e }, "cancelPurchaseOrder failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listPurchaseOrders(request, reply) {
  const parsed = listPurchaseOrdersQuerySchema.safeParse(request.query || {});
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

    const result = await purchaseOrdersService.listPurchaseOrders({
      locationId: effectiveLocationId,
      supplierId: parsed.data.supplierId ?? null,
      status: parsed.data.status ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
    });

    return reply.send({
      ok: true,
      purchaseOrders: result.rows,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listPurchaseOrders failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getPurchaseOrderById(request, reply) {
  const purchaseOrderId = Number(request.params?.id);
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return reply.status(400).send({ error: "Invalid purchase order id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await purchaseOrdersService.getPurchaseOrderById({
      purchaseOrderId,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Purchase order not found" });
    }

    return reply.send({
      ok: true,
      purchaseOrder: out.purchaseOrder,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getPurchaseOrderById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
};
