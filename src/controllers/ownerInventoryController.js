"use strict";

const ownerInventoryService = require("../services/ownerInventoryService");
const {
  ownerAdjustInventorySchema,
} = require("../validators/inventory.schema");

async function getOwnerInventorySummary(request, reply) {
  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive,
    );

    const summary = await ownerInventoryService.getOwnerInventorySummary({
      includeInactive,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listOwnerInventory(request, reply) {
  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive,
    );

    const inventory = await ownerInventoryService.listOwnerInventory({
      locationId: request.query?.locationId,
      includeInactive,
      search: request.query?.search,
      stockStatus: request.query?.stockStatus,
    });

    return reply.send({ ok: true, inventory });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getOwnerProductInventory(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const includeInactive = ownerInventoryService.parseBool(
      request.query?.includeInactive ?? "true",
    );

    const product =
      await ownerInventoryService.getOwnerProductInventoryByProductId({
        productId,
        includeInactive,
      });

    return reply.send({ ok: true, product });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function adjustOwnerInventory(request, reply) {
  const parsed = ownerAdjustInventorySchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const result = await ownerInventoryService.adjustOwnerInventory({
      actorUser: request.user,
      locationId: parsed.data.locationId,
      productId: parsed.data.productId,
      qtyChange: parsed.data.qtyChange,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, inventory: result });
  } catch (e) {
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "INVALID_PRODUCT") {
      return reply.status(400).send({ error: "Invalid product id" });
    }
    if (e.code === "BAD_QTY_CHANGE") {
      return reply
        .status(400)
        .send({ error: "qtyChange must be a non-zero integer" });
    }
    if (e.code === "INVALID_REASON") {
      return reply
        .status(400)
        .send({ error: "Reason must be at least 3 characters" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }
    if (e.code === "NOT_FOUND") {
      return reply
        .status(404)
        .send({ error: "Product not found in selected branch" });
    }
    if (e.code === "ARCHIVED") {
      return reply.status(409).send({ error: "Product is archived" });
    }
    if (e.code === "INSUFFICIENT_STOCK") {
      return reply.status(409).send({ error: "Insufficient stock" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  getOwnerInventorySummary,
  listOwnerInventory,
  getOwnerProductInventory,
  adjustOwnerInventory,
};
