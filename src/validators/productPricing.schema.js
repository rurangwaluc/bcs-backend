const { z } = require("zod");

const updateProductPricingSchema = z.object({
  purchasePrice: z.number().int().positive(),
  sellingPrice: z.number().int().positive(),
  maxDiscountPercent: z.number().int().min(0).max(100).default(0),
});

module.exports = { updateProductPricingSchema };
