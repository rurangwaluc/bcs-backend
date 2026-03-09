const { z } = require("zod");

const PRODUCT_TYPES = [
  "HARDWARE",
  "APPAREL",
  "FOOTWEAR",
  "PPE",
  "ACCESSORY",
  "OTHER",
];

const GENDERS = ["MEN", "WOMEN", "UNISEX", "KIDS"];

function upperTrim(v) {
  return String(v || "")
    .trim()
    .toUpperCase();
}

const createProductSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),

  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().max(80).optional(),
  unit: z.string().trim().min(1).max(30).default("PIECE"),

  sellingPrice: z.coerce.number().int().min(0),
  costPrice: z.coerce.number().int().min(0).default(0),
  maxDiscountPercent: z.coerce.number().int().min(0).max(100).default(0),

  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional(),

  productType: z
    .string()
    .transform(upperTrim)
    .refine((v) => PRODUCT_TYPES.includes(v), "Invalid productType")
    .default("HARDWARE"),

  category: z.string().trim().max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),

  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),

  variantLabel: z.string().trim().max(120).optional(),
  size: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  material: z.string().trim().max(80).optional(),

  barcode: z.string().trim().max(120).optional(),
  supplierCode: z.string().trim().max(120).optional(),

  reorderLevel: z.coerce.number().int().min(0).optional().default(0),

  gender: z
    .string()
    .transform(upperTrim)
    .refine((v) => !v || GENDERS.includes(v), "Invalid gender")
    .optional(),

  season: z.string().trim().max(40).optional(),

  openingQty: z.coerce.number().int().min(0).optional().default(0),
});

const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  sku: z.string().trim().max(80).optional(),
  unit: z.string().trim().min(1).max(30).optional(),

  sellingPrice: z.coerce.number().int().min(0).optional(),
  costPrice: z.coerce.number().int().min(0).optional(),
  maxDiscountPercent: z.coerce.number().int().min(0).max(100).optional(),

  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),

  productType: z
    .string()
    .transform(upperTrim)
    .refine((v) => PRODUCT_TYPES.includes(v), "Invalid productType")
    .optional(),

  category: z.string().trim().max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),

  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),

  variantLabel: z.string().trim().max(120).optional(),
  size: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  material: z.string().trim().max(80).optional(),

  barcode: z.string().trim().max(120).optional(),
  supplierCode: z.string().trim().max(120).optional(),

  reorderLevel: z.coerce.number().int().min(0).optional(),

  gender: z
    .string()
    .transform(upperTrim)
    .refine((v) => !v || GENDERS.includes(v), "Invalid gender")
    .optional(),

  season: z.string().trim().max(40).optional(),
});

const listProductsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  productType: z
    .string()
    .transform(upperTrim)
    .refine((v) => !v || PRODUCT_TYPES.includes(v), "Invalid productType")
    .optional(),
  category: z.string().trim().max(80).optional(),
  isActive: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .refine((v) => !v || ["true", "false"].includes(v), "Invalid isActive")
    .optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  PRODUCT_TYPES,
  GENDERS,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
};
