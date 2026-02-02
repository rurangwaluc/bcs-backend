const { z } = require("zod");

const RefundMethods = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

const createRefundSchema = z.object({
  saleId: z.number().int().positive(),
  reason: z.string().min(3).max(300).optional(),

  // optional, but if provided must be one of these
  method: z
    .string()
    .transform((v) => String(v || "").toUpperCase())
    .refine((v) => !v || RefundMethods.includes(v), "Invalid method")
    .optional(),

  // optional external reference (momo txn, bank ref, etc.)
  reference: z.string().min(1).max(120).optional(),
});

module.exports = { createRefundSchema };
