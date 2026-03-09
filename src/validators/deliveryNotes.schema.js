"use strict";

const { z } = require("zod");

const createDeliveryNoteSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  saleId: z.coerce.number().int().positive(),
  deliveryNoteNo: z.string().trim().max(120).optional(),

  deliveredTo: z.string().trim().max(160).optional(),
  deliveredPhone: z.string().trim().max(40).optional(),
  dispatchedAt: z.string().trim().min(1).optional(),
  deliveredAt: z.string().trim().min(1).optional(),
  note: z.string().trim().max(4000).optional(),
});

const listDeliveryNotesQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  saleId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  status: z.string().trim().max(30).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createDeliveryNoteSchema,
  listDeliveryNotesQuerySchema,
};
