const { z } = require("zod");

const createInventoryAdjustRequestSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyChange: z.coerce.number().int(),
  reason: z.string().min(3).max(500),
});

const listInventoryAdjustRequestsQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const decideInventoryAdjustRequestSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  createInventoryAdjustRequestSchema,
  listInventoryAdjustRequestsQuerySchema,
  decideInventoryAdjustRequestSchema,
};
