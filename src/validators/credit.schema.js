// backend/src/validators/credit.schema.js

const { z } = require("zod");

const createCreditSchema = z.object({
  saleId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

const approveCreditSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

// ✅ creditId removed (it comes from URL param :id)
const settleCreditSchema = z.object({
  method: z.string().min(1).max(30).optional(), // "CASH", "MOMO", "CARD" etc
  note: z.string().max(500).optional(),
});

module.exports = {
  createCreditSchema,
  approveCreditSchema,
  settleCreditSchema,
};
