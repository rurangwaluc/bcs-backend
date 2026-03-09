"use strict";

const { z } = require("zod");

const proformaItemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  productName: z.string().trim().min(1).max(180),
  productDisplayName: z.string().trim().max(220).optional(),
  productSku: z.string().trim().max(80).optional(),
  stockUnit: z.string().trim().min(1).max(40).optional(),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().int().min(0),
});

const createProformaSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  customerId: z.coerce.number().int().positive().optional(),
  customerName: z.string().trim().max(160).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  customerTin: z.string().trim().max(60).optional(),
  customerAddress: z.string().trim().max(2000).optional(),

  proformaNo: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(12).optional(),
  validUntil: z.string().trim().min(1).optional(),
  note: z.string().trim().max(4000).optional(),
  terms: z.string().trim().max(4000).optional(),

  items: z.array(proformaItemSchema).min(1),
});

const listProformasQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  status: z.string().trim().max(30).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createProformaSchema,
  listProformasQuerySchema,
};
