const { z } = require("zod");

const createStockRequestSchema = z.object({
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      qtyRequested: z.number().int().positive()
    })
  ).min(1)
});

const approveStockRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      qtyApproved: z.number().int().nonnegative()
    })
  ).optional()
});

module.exports = { createStockRequestSchema, approveStockRequestSchema };
