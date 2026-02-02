const { z } = require("zod");

const createDepositSchema = z.object({
  cashSessionId: z.number().int().positive().optional(),
  method: z.string().min(1).max(20).default("BANK"),
  amount: z.number().int().positive(),
  reference: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
});

module.exports = { createDepositSchema };
