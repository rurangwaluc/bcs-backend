const { z } = require("zod");

const createInventoryArrivalSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyReceived: z.coerce.number().int().positive(),
  notes: z.string().max(500).optional().nullable(),
  documentUrls: z
    .array(
      z
        .string()
        .refine(
          (v) =>
            v.startsWith("/") ||
            v.startsWith("http://") ||
            v.startsWith("https://"),
          { message: "Invalid URL" },
        ),
    )
    .optional()
    .default([]),
});

const listInventoryArrivalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  productId: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
};
