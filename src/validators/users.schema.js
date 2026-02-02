const { z } = require("zod");

const allowedRoles = [
  "owner",
  "admin",
  "manager",
  "store_keeper",
  "seller",
  "cashier",
];

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(allowedRoles),
  password: z.string().min(8),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    // keep email immutable for now (recommended)
    // email: z.string().email().optional(),

    role: z.enum(allowedRoles).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.role !== undefined ||
      data.isActive !== undefined,
    {
      message: "At least one field (name, role, isActive) must be provided",
    },
  );

module.exports = { createUserSchema, updateUserSchema, allowedRoles };
