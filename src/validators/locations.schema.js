const { z } = require("zod");

const locationCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase()),
});

const locationUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .transform((v) => v.toUpperCase())
      .optional(),
  })
  .refine(
    (x) => x.name !== undefined || x.code !== undefined,
    "Provide at least one field to update",
  );

const locationStatusChangeSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
});

module.exports = {
  locationCreateSchema,
  locationUpdateSchema,
  locationStatusChangeSchema,
};
