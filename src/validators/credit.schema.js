// backend/src/validators/credits.schema.js
const { z } = require("zod");

/**
 * POST /credits
 * Body: { saleId, note? }
 */
const createCreditSchema = z.object({
  saleId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

/**
 * PATCH /credits/:id/decision
 * Body: { decision: "APPROVE" | "REJECT", note? }
 */
const creditDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * PATCH /credits/:id/settle
 * Body: { method, note?, cashSessionId? }
 */
const creditSettleSchema = z.object({
  method: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => ["CASH", "MOMO", "CARD", "BANK", "OTHER"].includes(v), {
      message: "Invalid method",
    })
    .optional()
    .default("CASH"),
  note: z.string().trim().max(500).optional(),
  cashSessionId: z.number().int().positive().optional(),
});

module.exports = {
  createCreditSchema,
  approveCreditSchema: creditDecisionSchema,
  settleCreditSchema: creditSettleSchema,
  // keep originals too if you want:
  creditDecisionSchema,
  creditSettleSchema,
};
