const { z } = require("zod");

const supplierCreateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(140).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(140).optional(),
  country: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  sourceType: z.enum(["LOCAL", "ABROAD"]).optional(),
  defaultCurrency: z.enum(["RWF", "USD"]).optional(),
  address: z.string().trim().max(800).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});

const supplierUpdateSchema = supplierCreateSchema
  .partial()
  .refine(
    (x) => Object.keys(x || {}).length > 0,
    "Provide at least one field to update",
  );

module.exports = { supplierCreateSchema, supplierUpdateSchema };
