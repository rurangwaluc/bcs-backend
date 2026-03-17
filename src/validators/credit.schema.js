"use strict";

const { z } = require("zod");

const creditModeEnum = z.enum(["OPEN_BALANCE", "INSTALLMENT_PLAN"]);
const paymentMethodEnum = z.enum(["CASH", "MOMO", "CARD", "BANK", "OTHER"]);

const installmentRowSchema = z.object({
  amount: z.coerce.number().int().positive(),
  dueDate: z.string().min(1),
});

const createCreditSchema = z
  .object({
    saleId: z.coerce.number().int().positive(),
    creditMode: creditModeEnum.default("OPEN_BALANCE"),
    dueDate: z.string().optional().nullable(),
    note: z.string().max(500).optional().nullable(),

    amountPaidNow: z.coerce.number().int().min(0).optional().default(0),
    paymentMethodNow: paymentMethodEnum.optional().default("CASH"),
    cashSessionId: z.coerce.number().int().positive().optional().nullable(),
    reference: z.string().max(120).optional().nullable(),

    installmentCount: z.coerce.number().int().positive().optional().nullable(),
    installmentAmount: z.coerce.number().int().positive().optional().nullable(),
    firstInstallmentDate: z.string().optional().nullable(),

    installments: z.array(installmentRowSchema).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const mode = String(data.creditMode || "OPEN_BALANCE").toUpperCase();

    if (mode !== "INSTALLMENT_PLAN") return;

    const hasLegacyInstallments =
      Array.isArray(data.installments) && data.installments.length > 0;

    const hasFieldPlan =
      Number(data.installmentCount || 0) > 0 &&
      Number(data.installmentAmount || 0) > 0 &&
      !!String(data.firstInstallmentDate || "").trim();

    if (!hasLegacyInstallments && !hasFieldPlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["installments"],
        message:
          "For installment plan, provide installments or installmentCount + installmentAmount + firstInstallmentDate",
      });
    }
  });

const approveCreditSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional().nullable(),
});

const recordCreditPaymentSchema = z.object({
  amount: z.coerce.number().int().positive(),
  method: paymentMethodEnum.default("CASH"),
  note: z.string().max(500).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  cashSessionId: z.coerce.number().int().positive().optional().nullable(),
  installmentId: z.coerce.number().int().positive().optional().nullable(),
});

module.exports = {
  createCreditSchema,
  approveCreditSchema,
  recordCreditPaymentSchema,
};
