// backend/src/controllers/productPricingController.js
const {
  updateProductPricingSchema,
} = require("../validators/productPricing.schema");
const pricingService = require("../services/productPricingService");

async function updateProductPricing(request, reply) {
  const productId = Number(request.params.id);

  const parsed = updateProductPricingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const product = await pricingService.updatePricing({
      locationId: request.user.locationId,
      productId,
      purchasePrice: parsed.data.purchasePrice,
      sellingPrice: parsed.data.sellingPrice,
      maxDiscountPercent: parsed.data.maxDiscountPercent,
      userId: request.user.id,
    });

    return reply.send({ ok: true, product });
  } catch (e) {
    if (e.code === "BAD_PRICE")
      return reply.status(409).send({ error: e.message });
    if (e.code === "NOT_FOUND")
      return reply.status(404).send({ error: "Product not found" });

    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { updateProductPricing };
