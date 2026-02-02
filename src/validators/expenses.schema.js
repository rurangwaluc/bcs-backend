const { z } = require("zod");

const createExpenseSchema = z.object({
  cashSessionId: z.number().int().positive().optional(),
  category: z.string().min(1).max(60).default("GENERAL"),
  amount: z.number().int().positive(),
  reference: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
});

module.exports = { createExpenseSchema };
