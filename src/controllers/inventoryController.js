const {
  createProductSchema,
  adjustInventorySchema,
} = require("../validators/inventory.schema");

const {
  updateProductPricingSchema,
} = require("../validators/productPricing.schema");
const inventoryService = require("../services/inventoryService");

function canSeePurchasePrice(role) {
  return ["owner", "admin", "manager"].includes(String(role || ""));
}

async function createProduct(request, reply) {
  const parsed = createProductSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const created = await inventoryService.createProduct({
    locationId: request.user.locationId,
    userId: request.user.id,
    data: parsed.data,
  });

  return reply.send({
    ok: true,
    product: {
      ...created,
      purchasePrice: created.costPrice ?? 0,
    },
  });
}

async function listProducts(request, reply) {
  const includePurchase = canSeePurchasePrice(request.user.role);

  const rows = await inventoryService.listProducts({
    locationId: request.user.locationId,
    includePurchasePrice: includePurchase,
  });

  return reply.send({ ok: true, products: rows });
}

async function listInventory(request, reply) {
  const result = await inventoryService.getInventoryBalances({
    locationId: request.user.locationId,
  });
  return reply.send({ ok: true, inventory: result.rows || result });
}

async function adjustInventory(request, reply) {
  const parsed = adjustInventorySchema.safeParse(request.body);
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
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function updateProductPricing(request, reply) {
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
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Product not found" });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createProduct,
  listProducts,
  listInventory,
  adjustInventory,
  updateProductPricing,
};
