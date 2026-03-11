"use strict";

const { z } = require("zod");
const {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} = require("../utils/productCatalog");

const unitField = z
  .string()
  .trim()
  .transform((v) => String(v || "").toUpperCase())
  .refine((v) => PRODUCT_UNITS.includes(v), "Invalid unit");

const categoryField = z
  .string()
  .trim()
  .transform((v) => String(v || "").toUpperCase())
  .refine((v) => PRODUCT_CATEGORIES.includes(v), "Invalid category");

const createProductSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  name: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(220).optional(),

  category: categoryField.optional(),
  subcategory: z.string().trim().max(80).optional(),

  sku: z.string().trim().min(1).max(80).optional(),
  barcode: z.string().trim().min(1).max(120).optional(),
  supplierSku: z.string().trim().min(1).max(120).optional(),

  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  size: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  material: z.string().trim().max(80).optional(),
  variantSummary: z.string().trim().max(200).optional(),

  unit: unitField.optional(),
  stockUnit: unitField.optional(),
  salesUnit: unitField.optional(),
  purchaseUnit: unitField.optional(),

  purchaseUnitFactor: z.coerce.number().int().positive().max(100000).optional(),

  sellingPrice: z.coerce.number().int().nonnegative(),
  costPrice: z.coerce.number().int().nonnegative().optional(),
  maxDiscountPercent: z.coerce.number().int().min(0).max(100).optional(),

  openingQty: z.coerce.number().int().nonnegative().optional(),
  reorderLevel: z.coerce.number().int().nonnegative().optional(),

  trackInventory: z.coerce.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  attributes: z.record(z.any()).optional(),
});

const updateProductSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  name: z.string().trim().min(2).max(180).optional(),
  displayName: z.string().trim().min(2).max(220).optional(),

  category: categoryField.optional(),
  subcategory: z.string().trim().max(80).optional(),

  sku: z.string().trim().min(1).max(80).optional(),
  barcode: z.string().trim().min(1).max(120).optional(),
  supplierSku: z.string().trim().min(1).max(120).optional(),

  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  size: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  material: z.string().trim().max(80).optional(),
  variantSummary: z.string().trim().max(200).optional(),

  unit: unitField.optional(),
  stockUnit: unitField.optional(),
  salesUnit: unitField.optional(),
  purchaseUnit: unitField.optional(),

  purchaseUnitFactor: z.coerce.number().int().positive().max(100000).optional(),

  sellingPrice: z.coerce.number().int().nonnegative().optional(),
  costPrice: z.coerce.number().int().nonnegative().optional(),
  maxDiscountPercent: z.coerce.number().int().min(0).max(100).optional(),

  reorderLevel: z.coerce.number().int().nonnegative().optional(),

  trackInventory: z.coerce.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  attributes: z.record(z.any()).optional(),
});

const adjustInventorySchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyChange: z.coerce.number().int(),
  reason: z.string().trim().min(3).max(300),
});
const ownerAdjustInventorySchema = z.object({
  locationId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  qtyChange: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, {
      message: "qtyChange must not be zero",
    }),
  reason: z.string().trim().min(3).max(300),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  adjustInventorySchema,
  ownerAdjustInventorySchema,
};
