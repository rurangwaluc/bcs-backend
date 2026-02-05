const {
  createSaleSchema,
  markSaleSchema,
  cancelSaleSchema,
  fulfillSaleSchema,
} = require("../validators/sales.schema");
const salesService = require("../services/salesService");

async function createSale(request, reply) {
  const parsed = createSaleSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await salesService.createSale({
      locationId: request.user.locationId,
      sellerId: request.user.id,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      note: parsed.data.note,
      items: parsed.data.items,
      discountPercent: parsed.data.discountPercent,
      discountAmount: parsed.data.discountAmount,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "PRODUCT_NOT_FOUND") {
      return reply
        .status(404)
        .send({ error: "Product not found", debug: e.debug });
    }
    if (e.code === "BAD_QTY")
      return reply.status(400).send({ error: "Invalid qty" });

    if (e.code === "PRICE_TOO_HIGH") {
      return reply.status(409).send({
        error: "Unit price cannot be above selling price",
        debug: e.debug,
      });
    }

    if (e.code === "BAD_DISCOUNT")
      return reply.status(409).send({ error: "Invalid discount" });

    if (e.code === "DISCOUNT_TOO_HIGH") {
      return reply.status(409).send({
        error: "Discount percent exceeds allowed maximum",
        debug: e.debug,
      });
    }

    if (e.code === "SALE_DISCOUNT_TOO_HIGH") {
      return reply.status(409).send({
        error: "Sale discount percent exceeds allowed maximum",
        debug: e.debug,
      });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function fulfillSale(request, reply) {
  const saleId = Number(request.params.id);
  if (!saleId) return reply.status(400).send({ error: "Invalid sale id" });

  const parsed = fulfillSaleSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await salesService.fulfillSale({
      locationId: request.user.locationId,
      storeKeeperId: request.user.id,
      saleId,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Sale not found" });

    if (e.code === "BAD_STATUS")
      return reply
        .status(409)
        .send({ error: "Invalid sale status", debug: e.debug });

    if (e.code === "INSUFFICIENT_INVENTORY_STOCK") {
      return reply.status(409).send({
        error: "Insufficient inventory stock",
        debug: e.debug,
      });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function markSale(request, reply) {
  const parsed = markSaleSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid body",
      details: parsed.error.flatten(),
    });
  }

  const saleId = Number(request.params.id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return reply.status(400).send({ error: "Invalid sale id" });
  }

  try {
    const data = await salesService.markSale({
      saleId,
      userId: request.user.id,
      locationId: request.user.locationId,
      status: parsed.data.status,
      paymentMethod: parsed.data.paymentMethod, // ✅ NEW
    });

    return reply.send({ ok: true, sale: data });
  } catch (e) {
    request.log.error(e);
    return reply.status(400).send({
      error: e?.message || "Failed to mark sale",
    });
  }
}

async function cancelSale(request, reply) {
  const saleId = Number(request.params.id);

  const parsed = cancelSaleSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const sale = await salesService.cancelSale({
      locationId: request.user.locationId,
      userId: request.user.id,
      saleId,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, sale });
  } catch (e) {
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Sale not found" });
    if (e.code === "BAD_STATUS")
      return reply.status(409).send({ error: "Invalid sale status" });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createSale, fulfillSale, markSale, cancelSale };
