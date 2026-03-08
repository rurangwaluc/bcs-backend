"use strict";

const {
  markSaleSchema,
  cancelSaleSchema,
  fulfillSaleSchema,
} = require("../validators/sales.schema");

const ownerSalesService = require("../services/ownerSalesService");

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toSaleId(params) {
  const id = toInt(params?.id, null);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getOwnerSalesSummary(request, reply) {
  try {
    const summary = await ownerSalesService.getOwnerSalesSummary({
      locationId: request.query?.locationId || null,
      status: request.query?.status || null,
      sellerId: request.query?.sellerId || null,
      q: request.query?.q || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerSalesSummary failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listOwnerSales(request, reply) {
  try {
    const sales = await ownerSalesService.listOwnerSales({
      locationId: request.query?.locationId || null,
      status: request.query?.status || null,
      sellerId: request.query?.sellerId || null,
      q: request.query?.q || null,
      dateFrom: request.query?.dateFrom || null,
      dateTo: request.query?.dateTo || null,
      limit: request.query?.limit || 50,
      offset: request.query?.offset || 0,
    });

    return reply.send({ ok: true, sales });
  } catch (e) {
    request.log.error({ err: e }, "listOwnerSales failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getOwnerSale(request, reply) {
  const saleId = toSaleId(request.params);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  try {
    const sale = await ownerSalesService.getOwnerSaleById({ saleId });

    if (!sale) {
      return reply.status(404).send({ error: "Sale not found" });
    }

    return reply.send({ ok: true, sale });
  } catch (e) {
    request.log.error({ err: e }, "getOwnerSale failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function ownerCancelSale(request, reply) {
  const saleId = toSaleId(request.params);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  const parsed = cancelSaleSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await ownerSalesService.ownerCancelSale({
      actorUserId: request.user.id,
      saleId,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Sale not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({ error: "Invalid sale status" });
    }

    request.log.error({ err: e }, "ownerCancelSale failed");
    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

async function ownerMarkSale(request, reply) {
  const saleId = toSaleId(request.params);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  const parsed = markSaleSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await ownerSalesService.ownerMarkSale({
      actorUserId: request.user.id,
      saleId,
      status: parsed.data.status,
      paymentMethod: parsed.data.paymentMethod,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Sale not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({
        error: "Invalid sale status",
        debug: e.debug,
      });
    }

    if (e.code === "MISSING_CUSTOMER") {
      return reply.status(409).send({ error: e.message });
    }

    if (e.code === "BAD_PAYMENT_METHOD") {
      return reply.status(400).send({
        error: "Invalid payment method",
        debug: e.debug,
      });
    }

    if (e.code === "BAD_USER") {
      return reply.status(400).send({ error: "Invalid user" });
    }

    request.log.error({ err: e }, "ownerMarkSale failed");
    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

async function ownerFulfillSale(request, reply) {
  const saleId = toSaleId(request.params);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  const parsed = fulfillSaleSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await ownerSalesService.ownerFulfillSale({
      actorUserId: request.user.id,
      saleId,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Sale not found" });
    }

    if (e.code === "BAD_STATUS") {
      return reply.status(409).send({
        error: "Invalid sale status",
        debug: e.debug,
      });
    }

    if (e.code === "NO_ITEMS") {
      return reply.status(409).send({ error: "Sale has no items" });
    }

    if (e.code === "INSUFFICIENT_INVENTORY_STOCK") {
      return reply.status(409).send({
        error: "Insufficient inventory stock",
        debug: e.debug,
      });
    }

    request.log.error({ err: e }, "ownerFulfillSale failed");
    return reply.status(500).send({
      error: "Internal Server Error",
      debug: { code: e?.code },
    });
  }
}

module.exports = {
  getOwnerSalesSummary,
  listOwnerSales,
  getOwnerSale,
  ownerCancelSale,
  ownerMarkSale,
  ownerFulfillSale,
};
