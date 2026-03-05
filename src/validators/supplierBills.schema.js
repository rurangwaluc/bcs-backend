const { z } = require("zod");

const billItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  description: z.string().trim().min(1).max(240),
  qty: z.number().int().positive(),
  unitCost: z.number().int().nonnegative(),
});

const supplierBillCreateSchema = z.object({
  supplierId: z.number().int().positive(),
  billNo: z.string().trim().max(80).optional(),
  currency: z.string().trim().min(1).max(8).optional(),

  // If items are provided, server will recompute totalAmount.
  totalAmount: z.number().int().nonnegative().optional(),
  issuedDate: z.string().trim().optional(), // ISO date
  dueDate: z.string().trim().optional(), // ISO date
  note: z.string().trim().max(2000).optional(),
  status: z.enum(["DRAFT", "OPEN", "PAID", "VOID"]).optional(),

  items: z.array(billItemSchema).optional(),
});

const supplierBillUpdateSchema = z
  .object({
    billNo: z.string().trim().max(80).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    totalAmount: z.number().int().nonnegative().optional(),
    issuedDate: z.string().trim().optional(),
    dueDate: z.string().trim().optional(),
    note: z.string().trim().max(2000).optional(),
    status: z.enum(["DRAFT", "OPEN", "PAID", "VOID"]).optional(),
    items: z.array(billItemSchema).optional(),
  })
  .refine((x) => Object.keys(x || {}).length > 0, "Provide at least one field");

const supplierBillPaymentCreateSchema = z.object({
  amount: z.number().int().positive(),
  method: z.string().trim().min(1).max(20),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(200).optional(),
  paidAt: z.string().trim().optional(), // ISO datetime
});

module.exports = {
  supplierBillCreateSchema,
  supplierBillUpdateSchema,
  supplierBillPaymentCreateSchema,
};
