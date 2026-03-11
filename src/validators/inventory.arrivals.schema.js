"use strict";

const { z } = require("zod");

const arrivalItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyReceived: z.coerce.number().int().min(0).default(0),
  bonusQty: z.coerce.number().int().min(0).default(0),
  unitCost: z.coerce.number().int().min(0).default(0),
  note: z.string().max(300).optional().nullable(),
});

const createInventoryArrivalSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  documentNo: z.string().max(120).optional().nullable(),
  sourceType: z
    .enum([
      "MANUAL",
      "PURCHASE_ORDER",
      "SUPPLIER_DELIVERY",
      "TRANSFER_IN",
      "OTHER",
    ])
    .optional()
    .default("MANUAL"),
  sourceId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  items: z.array(arrivalItemSchema).min(1),
});

const listInventoryArrivalsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
};
