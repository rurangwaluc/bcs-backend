// backend/src/validators/refunds.schema.js

const { z } = require("zod");

const RefundMethods = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

const refundItemSchema = z.object({
  saleItemId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().positive(),
});

const createRefundSchema = z.object({
  saleId: z.coerce.number().int().positive(),
  reason: z.string().min(3).max(300).optional(),

  method: z
    .string()
    .transform((v) => String(v || "").toUpperCase())
    .refine((v) => !v || RefundMethods.includes(v), "Invalid method")
    .optional(),

  reference: z.string().min(1).max(120).optional(),

  // Optional: if missing => full refund
  items: z.array(refundItemSchema).min(1).optional(),
});

module.exports = { createRefundSchema };