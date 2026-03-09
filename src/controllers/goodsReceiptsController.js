"use strict";

const {
  createGoodsReceiptSchema,
  listGoodsReceiptsQuerySchema,
} = require("../validators/goodsReceipts.schema");

const goodsReceiptsService = require("../services/goodsReceiptsService");

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

async function createGoodsReceipt(request, reply) {
  const parsed = createGoodsReceiptSchema.safeParse(request.body || {});
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
    const out = await goodsReceiptsService.createGoodsReceipt({
      actorUser: request.user,
      locationId: effectiveLocationId,
      purchaseOrderId: parsed.data.purchaseOrderId,
      receiptNo: parsed.data.receiptNo,
      reference: parsed.data.reference,
      note: parsed.data.note,
      receivedAt: parsed.data.receivedAt,
      items: parsed.data.items,
    });

    return reply.send({
      ok: true,
      goodsReceipt: out.goodsReceipt,
      items: out.items,
    });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: e.message });
    }

    if (
      ["BAD_STATUS", "BAD_ITEMS", "PRODUCT_REQUIRED", "OVER_RECEIPT"].includes(
        e.code,
      )
    ) {
      return reply.status(409).send({
        error: e.message,
        debug: e.debug || undefined,
      });
    }

    request.log.error({ err: e }, "createGoodsReceipt failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listGoodsReceipts(request, reply) {
  const parsed = listGoodsReceiptsQuerySchema.safeParse(request.query || {});
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

    const result = await goodsReceiptsService.listGoodsReceipts({
      locationId: effectiveLocationId,
      purchaseOrderId: parsed.data.purchaseOrderId ?? null,
      supplierId: parsed.data.supplierId ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
      limit: parsed.data.limit ?? 50,
      cursor: parsed.data.cursor ?? null,
    });

    return reply.send({
      ok: true,
      goodsReceipts: result.rows,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listGoodsReceipts failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getGoodsReceiptById(request, reply) {
  const goodsReceiptId = Number(request.params?.id);
  if (!Number.isInteger(goodsReceiptId) || goodsReceiptId <= 0) {
    return reply.status(400).send({ error: "Invalid goods receipt id" });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner ? null : request.user.locationId;

    const out = await goodsReceiptsService.getGoodsReceiptById({
      goodsReceiptId,
      locationId: effectiveLocationId,
    });

    if (!out) {
      return reply.status(404).send({ error: "Goods receipt not found" });
    }

    return reply.send({
      ok: true,
      goodsReceipt: out.goodsReceipt,
      items: out.items,
    });
  } catch (e) {
    request.log.error({ err: e }, "getGoodsReceiptById failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createGoodsReceipt,
  listGoodsReceipts,
  getGoodsReceiptById,
};
