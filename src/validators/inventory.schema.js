const { z } = require("zod");

const createProductSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  sellingPrice: z.number().int().nonnegative(),
  costPrice: z.number().int().nonnegative().optional(),
  notes: z.string().optional()
});

const adjustInventorySchema = z.object({
  productId: z.number().int().positive(),
  qtyChange: z.number().int(), // + for stock in, - for stock out
  reason: z.string().min(3)
});

module.exports = { createProductSchema, adjustInventorySchema };
