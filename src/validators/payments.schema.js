// backend/src/validators/payments.schema.js
const { z } = require("zod");

const recordPaymentSchema = z.object({
  saleId: z.number().int().positive(),
  amount: z.number().int().positive(),

  // ✅ match frontend
  method: z.enum(["CASH", "MOMO", "CARD", "BANK", "OTHER"]).optional(),

  note: z.string().trim().max(200).optional(),

  // ✅ REQUIRED by backend service
  cashSessionId: z.number().int().positive(),
});

module.exports = { recordPaymentSchema };
