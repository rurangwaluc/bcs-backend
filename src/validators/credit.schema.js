const { z } = require("zod");

const CREDIT_MODES = ["OPEN_BALANCE", "INSTALLMENT_PLAN"];
const PAYMENT_METHODS = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

const installmentItemSchema = z.object({
  amount: z.coerce.number().int().positive(),
  dueDate: z.string().datetime({ offset: true }),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /credits
 * Body:
 * {
 *   saleId,
 *   creditMode?,
 *   dueDate?,              // used mainly for OPEN_BALANCE
 *   note?,
 *   installments?: [       // required for INSTALLMENT_PLAN
 *     { amount, dueDate, note? }
 *   ]
 * }
 */
const createCreditSchema = z
  .object({
    saleId: z.coerce.number().int().positive(),
    creditMode: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => CREDIT_MODES.includes(v), {
        message: "Invalid credit mode",
      })
      .optional()
      .default("OPEN_BALANCE"),
    dueDate: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(500).optional(),
    installments: z.array(installmentItemSchema).max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.creditMode === "INSTALLMENT_PLAN") {
      if (!Array.isArray(data.installments) || data.installments.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["installments"],
          message: "Installments are required for installment plan",
        });
      }
    }
  });

/**
 * PATCH /credits/:id/decision
 * Body: { decision: "APPROVE" | "REJECT", note? }
 */
const approveCreditSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * PATCH /credits/:id/payment
 * Body: { amount, method, note?, cashSessionId?, reference? }
 */
const recordCreditPaymentSchema = z.object({
  amount: z.coerce.number().int().positive(),
  method: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => PAYMENT_METHODS.includes(v), {
      message: "Invalid payment method",
    })
    .optional()
    .default("CASH"),
  note: z.string().trim().max(500).optional(),
  reference: z.string().trim().max(120).optional(),
  cashSessionId: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createCreditSchema,
  approveCreditSchema,
  recordCreditPaymentSchema,
};
