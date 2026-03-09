"use strict";

const { z } = require("zod");

const PurchaseOrderStatuses = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

const purchaseOrderItemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  productName: z.string().trim().min(1).max(180).optional(),
  qtyOrdered: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().int().nonnegative(),
  note: z.string().trim().max(300).optional(),
});

const createPurchaseOrderSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive(),

  poNo: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(12).optional(),
  notes: z.string().trim().max(4000).optional(),

  orderedAt: z.string().trim().min(1).optional(),
  expectedAt: z.string().trim().min(1).optional(),

  items: z.array(purchaseOrderItemSchema).min(1),
});

const updatePurchaseOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),

  poNo: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(12).optional(),
  notes: z.string().trim().max(4000).optional(),

  orderedAt: z.string().trim().min(1).optional(),
  expectedAt: z.string().trim().min(1).optional(),

  items: z.array(purchaseOrderItemSchema).min(1).optional(),
});

const approvePurchaseOrderSchema = z.object({});

const cancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});

const listPurchaseOrdersQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .trim()
    .transform((v) => String(v || "").toUpperCase())
    .refine((v) => !v || PurchaseOrderStatuses.includes(v), "Invalid status")
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  PurchaseOrderStatuses,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  approvePurchaseOrderSchema,
  cancelPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
};
