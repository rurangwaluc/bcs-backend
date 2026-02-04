const { z } = require("zod");

const recordPaymentSchema = z.object({
  saleId: z.number().int().positive(),
  amount: z.number().int().positive(),

  // ✅ match what frontend can send (and what you want to support)
  method: z
    .enum(["CASH", "MOMO", "CARD", "BANK", "OTHER"])
    .optional()
    .default("CASH"),

  note: z.string().max(200).optional(),

  // ✅ REQUIRED by your recordPayment service (session validation)
  cashSessionId: z.number().int().positive(),
});

module.exports = { recordPaymentSchema };
