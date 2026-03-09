"use strict";

const { z } = require("zod");

const arrivalItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyReceived: z.coerce.number().int().nonnegative(),
  bonusQty: z.coerce.number().int().nonnegative().optional(),
  unitCost: z.coerce.number().int().nonnegative(),
  note: z.string().trim().max(300).optional(),
});

const createInventoryArrivalSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),

  reference: z.string().trim().max(120).optional(),
  documentNo: z.string().trim().max(120).optional(),

  sourceType: z
    .string()
    .trim()
    .transform((v) => String(v || "MANUAL").toUpperCase())
    .optional(),

  sourceId: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().max(4000).optional(),
  receivedAt: z.string().trim().min(1).optional(),

  items: z.array(arrivalItemSchema).min(1),
});

const listInventoryArrivalsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createInventoryArrivalSchema,
  listInventoryArrivalsQuerySchema,
};
