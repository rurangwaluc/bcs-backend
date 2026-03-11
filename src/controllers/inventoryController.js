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

function resolveLocationId(user) {
  const raw =
    user?.locationId ?? user?.location_id ?? user?.location?.id ?? null;

  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function ensureLocationId(request, reply, actionName) {
  const locationId = resolveLocationId(request.user);

  if (!locationId) {
    request.log.error(
      { user: request.user },
      `${actionName} failed: missing user locationId`,
    );
    reply.status(400).send({ error: "Missing user location" });
    return null;
  }

  return locationId;
}

async function createProduct(request, reply) {
  const parsed = createProductSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const locationId = ensureLocationId(request, reply, "createProduct");
  if (!locationId) return;

  try {
    const created = await inventoryService.createProduct({
      locationId,
      userId: request.user?.id ?? null,
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
    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        body: request.body,
      },
      "createProduct failed",
    );
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listProducts(request, reply) {
  const includePurchasePrice = canSeePurchasePrice(request.user?.role);
  const includeInactive = parseIncludeInactive(request.query?.includeInactive);

  const locationId = ensureLocationId(request, reply, "listProducts");
  if (!locationId) return;

  try {
    const rows = await inventoryService.listProducts({
      locationId,
      includePurchasePrice,
      includeInactive,
    });

    return reply.send({ ok: true, products: rows });
  } catch (e) {
    request.log.error(
      {
        err: e,
        user: request.user,
        query: request.query,
        locationId,
      },
      "listProducts failed",
    );
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listInventory(request, reply) {
  const includeInactive = parseIncludeInactive(request.query?.includeInactive);

  const locationId = ensureLocationId(request, reply, "listInventory");
  if (!locationId) return;

  try {
    const rows = await inventoryService.getInventoryBalances({
      locationId,
      includeInactive,
    });

    return reply.send({ ok: true, inventory: rows });
  } catch (e) {
    request.log.error(
      {
        err: e,
        user: request.user,
        query: request.query,
        locationId,
      },
      "listInventory failed",
    );
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

  const locationId = ensureLocationId(request, reply, "adjustInventory");
  if (!locationId) return;

  try {
    const out = await inventoryService.adjustInventory({
      locationId,
      userId: request.user?.id ?? null,
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

    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        body: request.body,
      },
      "adjustInventory failed",
    );
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

  const locationId = ensureLocationId(request, reply, "updateProductPricing");
  if (!locationId) return;

  try {
    const updated = await inventoryService.updateProductPricing({
      locationId,
      userId: request.user?.id ?? null,
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

    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        productId,
        body: request.body,
      },
      "updateProductPricing failed",
    );
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function archiveProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const locationId = ensureLocationId(request, reply, "archiveProduct");
  if (!locationId) return;

  try {
    const updated = await inventoryService.archiveProduct({
      locationId,
      userId: request.user?.id ?? null,
      productId,
      reason: request.body?.reason,
    });

    return reply.send({ ok: true, product: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        productId,
        body: request.body,
      },
      "archiveProduct failed",
    );
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function restoreProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const locationId = ensureLocationId(request, reply, "restoreProduct");
  if (!locationId) return;

  try {
    const updated = await inventoryService.restoreProduct({
      locationId,
      userId: request.user?.id ?? null,
      productId,
    });

    return reply.send({ ok: true, product: updated });
  } catch (e) {
    if (e.code === "NOT_FOUND") {
      return reply.status(404).send({ error: "Product not found" });
    }

    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        productId,
      },
      "restoreProduct failed",
    );
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function deleteProduct(request, reply) {
  const productId = Number(request.params?.id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return reply.status(400).send({ error: "Invalid product id" });
  }

  const locationId = ensureLocationId(request, reply, "deleteProduct");
  if (!locationId) return;

  try {
    const out = await inventoryService.deleteProductIfSafe({
      locationId,
      userId: request.user?.id ?? null,
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

    request.log.error(
      {
        err: e,
        user: request.user,
        locationId,
        productId,
      },
      "deleteProduct failed",
    );
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
