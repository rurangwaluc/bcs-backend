// backend/src/validators/payments.schema.js
const { z } = require("zod");

const recordPaymentSchema = z.object({
  saleId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),

  // match frontend
  method: z.enum(["CASH", "MOMO", "CARD", "BANK", "OTHER"]).optional(),
  note: z.string().trim().max(200).optional(),

  // ✅ OPTIONAL: backend will auto-resolve open session if missing
  cashSessionId: z.coerce.number().int().positive().optional(),
});

module.exports = { recordPaymentSchema };