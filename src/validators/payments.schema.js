const { z } = require("zod");

const recordPaymentSchema = z.object({
  saleId: z.number().int().positive(),
  amount: z.number().int().positive(),
  method: z.enum(["CASH", "MOMO"]).optional(),
  note: z.string().optional(),
});

module.exports = { recordPaymentSchema };
