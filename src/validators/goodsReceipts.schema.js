"use strict";

const { z } = require("zod");

const receiveItemSchema = z.object({
  purchaseOrderItemId: z.coerce.number().int().positive(),
  qtyReceived: z.coerce.number().int().positive(),
  note: z.string().trim().max(300).optional(),
});

const createGoodsReceiptSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  purchaseOrderId: z.coerce.number().int().positive(),
  receiptNo: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(4000).optional(),
  receivedAt: z.string().trim().min(1).optional(),

  items: z.array(receiveItemSchema).min(1),
});

const listGoodsReceiptsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  purchaseOrderId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createGoodsReceiptSchema,
  listGoodsReceiptsQuerySchema,
};
