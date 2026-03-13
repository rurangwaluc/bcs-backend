"use strict";

const { z } = require("zod");

const arrivalItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyReceived: z.coerce.number().int().nonnegative().optional().default(0),
  bonusQty: z.coerce.number().int().nonnegative().optional().default(0),
  unitCost: z.coerce.number().int().nonnegative().optional().default(0),
  note: z.string().trim().max(300).optional().nullable(),
});

const createInventoryArrivalSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  documentNo: z.string().trim().max(120).optional().nullable(),
  sourceType: z.string().trim().max(40).optional().default("MANUAL"),
  sourceId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  receivedAt: z.string().trim().optional().nullable(),
  items: z.array(arrivalItemSchema).min(1),
});

const listInventoryArrivalsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.coerce.number().int().positive().optional(),
});

module.exports = {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
};
