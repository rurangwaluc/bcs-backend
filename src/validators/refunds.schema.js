"use strict";

const { z } = require("zod");

const RefundMethods = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

const refundItemSchema = z.object({
  saleItemId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().positive(),
});

const createRefundSchema = z.object({
  // owner can choose branch; non-owner controller will ignore/override
  locationId: z.coerce.number().int().positive().optional(),

  saleId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(300).optional(),

  method: z
    .string()
    .transform((v) => String(v || "").toUpperCase())
    .refine((v) => !v || RefundMethods.includes(v), "Invalid method")
    .optional(),

  reference: z.string().trim().min(1).max(120).optional(),

  // if missing => full refund
  items: z.array(refundItemSchema).min(1).optional(),
});

const listRefundsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  saleId: z.coerce.number().int().positive().optional(),
  method: z
    .string()
    .trim()
    .transform((v) => String(v || "").toUpperCase())
    .refine((v) => !v || RefundMethods.includes(v), "Invalid method")
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createRefundSchema,
  listRefundsQuerySchema,
};
