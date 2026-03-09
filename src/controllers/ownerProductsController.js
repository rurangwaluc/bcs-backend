"use strict";

const ownerProductsService = require("../services/ownerProductsService");
const {
  createProductSchema,
  updateProductSchema,
} = require("../validators/inventory.schema");
const {
  updateProductPricingSchema,
} = require("../validators/productPricing.schema");

async function getOwnerProductsSummary(request, reply) {
  try {
    const includeInactive = ownerProductsService.parseBool(
      request.query?.includeInactive,
    );

    const summary = await ownerProductsService.getOwnerProductsSummary({
      includeInactive,
    });

    return reply.send({ ok: true, summary });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listOwnerProducts(request, reply) {
  try {
    const includeInactive = ownerProductsService.parseBool(
      request.query?.includeInactive,
    );

    const products = await ownerProductsService.listOwnerProducts({
      locationId: request.query?.locationId,
      includeInactive,
      search: request.query?.search,
      status: request.query?.status,
    });

    return reply.send({ ok: true, products });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function getOwnerProductBranches(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const includeInactive = ownerProductsService.parseBool(
      request.query?.includeInactive ?? "true",
    );

    const product =
      await ownerProductsService.getOwnerProductBranchesByProductId({
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

async function createOwnerProduct(request, reply) {
  const parsed = createProductSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const product = await ownerProductsService.createOwnerProduct({
      actorUser: request.user,
      data: parsed.data,
    });

    return reply.send({ ok: true, product });
  } catch (e) {
    if (e.code === "LOCATION_REQUIRED") {
      return reply.status(400).send({ error: "Owner must choose a branch" });
    }
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }
    if (e.code === "LOCATION_NOT_ACTIVE") {
      return reply
        .status(409)
        .send({ error: "Products can only be created in an active branch" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateOwnerProduct(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const parsed = updateProductSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const product = await ownerProductsService.updateOwnerProduct({
      actorUser: request.user,
      productId,
      data: parsed.data,
    });

    return reply.send({ ok: true, product });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }
    if (e.code === "INVALID_LOCATION") {
      return reply.status(400).send({ error: "Invalid location id" });
    }
    if (e.code === "LOCATION_NOT_FOUND") {
      return reply.status(404).send({ error: "Location not found" });
    }
    if (e.code === "LOCATION_NOT_ACTIVE") {
      return reply
        .status(409)
        .send({ error: "Product can only be moved to an active branch" });
    }

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateOwnerProductPricing(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const parsed = updateProductPricingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const product = await ownerProductsService.updateOwnerProductPricing({
      actorUser: request.user,
      productId,
      purchasePrice: parsed.data.purchasePrice,
      sellingPrice: parsed.data.sellingPrice,
      maxDiscountPercent: parsed.data.maxDiscountPercent ?? 0,
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

async function archiveOwnerProduct(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const product = await ownerProductsService.archiveOwnerProduct({
      actorUser: request.user,
      productId,
      reason: request.body?.reason,
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

async function restoreOwnerProduct(request, reply) {
  const productId = Number(request.params.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const product = await ownerProductsService.restoreOwnerProduct({
      actorUser: request.user,
      productId,
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

module.exports = {
  getOwnerProductsSummary,
  listOwnerProducts,
  getOwnerProductBranches,
  createOwnerProduct,
  updateOwnerProduct,
  updateOwnerProductPricing,
  archiveOwnerProduct,
  restoreOwnerProduct,
};
