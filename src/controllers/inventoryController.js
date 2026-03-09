"use strict";

const {
  createProductSchema,
  adjustInventorySchema,
} = require("../validators/inventory.schema");
const {
  updateProductPricingSchema,
} = require("../validators/productPricing.schema");

const inventoryService = require("../services/inventoryService");

function canSeePurchasePrice(role) {
  return ["owner", "admin", "manager"].includes(
    String(role || "")
      .trim()
      .toLowerCase(),
  );
}

function parseIncludeInactive(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true";
}

async function createProduct(request, reply) {
  const parsed = createProductSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const created = await inventoryService.createProduct({
      locationId: request.user.locationId,
      userId: request.user.id,
      data: parsed.data,
    });

    return reply.send({
      ok: true,
      product: {
        ...created,
        purchasePrice: created.purchasePrice ?? created.costPrice ?? 0,
      },
    });
  } catch (e) {
    request.log.error({ err: e }, "createProduct failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listProducts(request, reply) {
  const includePurchasePrice = canSeePurchasePrice(request.user?.role);
  const includeInactive = parseIncludeInactive(request.query?.includeInactive);

  try {
    const rows = await inventoryService.listProducts({
      locationId: request.user.locationId,
      includePurchasePrice,
      includeInactive,
    });

    return reply.send({ ok: true, products: rows });
  } catch (e) {
    request.log.error({ err: e }, "listProducts failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listInventory(request, reply) {
  const includeInactive = parseIncludeInactive(request.query?.includeInactive);

  try {
    const rows = await inventoryService.getInventoryBalances({
      locationId: request.user.locationId,
      includeInactive,
    });

    return reply.send({ ok: true, inventory: rows });
  } catch (e) {
    request.log.error({ err: e }, "listInventory failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function adjustInventory(request, reply) {
  const parsed = adjustInventorySchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const out = await inventoryService.adjustInventory({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId: parsed.data.productId,
      qtyChange: parsed.data.qtyChange,
      reason: parsed.data.reason,
    });

    return reply.send({ ok: true, result: out });
  } catch (e) {
    if (e.code === "INSUFFICIENT_STOCK") {
      return reply.status(409).send({ error: "Insufficient stock" });
    }

    if (e.code === "ARCHIVED") {
      return reply.status(409).send({ error: "Product is archived" });
    }

    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    if (e.code === "BAD_QTY_CHANGE") {
      return reply.status(400).send({ error: e.message });
    }

    request.log.error({ err: e }, "adjustInventory failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateProductPricing(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const parsed = updateProductPricingSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const updated = await inventoryService.updateProductPricing({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId,
      purchasePrice: parsed.data.purchasePrice,
      sellingPrice: parsed.data.sellingPrice,
      maxDiscountPercent: parsed.data.maxDiscountPercent ?? 0,
    });

    return reply.send({ ok: true, product: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error({ err: e }, "updateProductPricing failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function archiveProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const updated = await inventoryService.archiveProduct({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId,
      reason: request.body?.reason,
    });

    return reply.send({ ok: true, product: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error({ err: e }, "archiveProduct failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function restoreProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const updated = await inventoryService.restoreProduct({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId,
    });

    return reply.send({ ok: true, product: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error({ err: e }, "restoreProduct failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function deleteProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  try {
    const out = await inventoryService.deleteProductIfSafe({
      locationId: request.user.locationId,
      userId: request.user.id,
      productId,
    });

    return reply.send(out);
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    if (e.code === "STOCK_NOT_ZERO") {
      return reply.status(409).send({ error: "Cannot delete: stock not zero" });
    }

    if (e.code === "HAS_NOTES") {
      return reply
        .status(409)
        .send({ error: "Cannot delete: product has notes" });
    }

    request.log.error({ err: e }, "deleteProduct failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createProduct,
  listProducts,
  listInventory,
  adjustInventory,
  updateProductPricing,
  archiveProduct,
  restoreProduct,
  deleteProduct,
};
