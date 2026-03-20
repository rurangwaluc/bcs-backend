const { z } = require("zod");

function emptyToUndefined(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

const optionalText = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalUrlLike = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => /^https?:\/\//i.test(v) || v.startsWith("/"),
      "Website/logo must be an absolute URL or a root-relative path like /uploads/file.png",
    )
    .optional(),
);

const bankAccountSchema = z.object({
  bankName: z.string().trim().max(120).optional(),
  accountName: z.string().trim().max(160).optional(),
  accountNumber: z.string().trim().max(120).optional(),
});

const locationCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase()),

  email: optionalText(160),
  phone: optionalText(40),
  website: optionalUrlLike,
  logoUrl: optionalUrlLike,

  address: optionalText(255),
  tin: optionalText(64),
  momoCode: optionalText(64),
  bankAccounts: z.array(bankAccountSchema).optional(),
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

    email: optionalText(160),
    phone: optionalText(40),
    website: optionalUrlLike,
    logoUrl: optionalUrlLike,

    address: optionalText(255),
    tin: optionalText(64),
    momoCode: optionalText(64),
    bankAccounts: z.array(bankAccountSchema).optional(),
  })
  .refine(
    (x) =>
      x.name !== undefined ||
      x.code !== undefined ||
      x.email !== undefined ||
      x.phone !== undefined ||
      x.website !== undefined ||
      x.logoUrl !== undefined ||
      x.address !== undefined ||
      x.tin !== undefined ||
      x.momoCode !== undefined ||
      x.bankAccounts !== undefined,
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
