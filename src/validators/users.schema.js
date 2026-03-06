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
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum(allowedRoles),
  password: z.string().min(8),
  isActive: z.boolean().optional(),

  // Owner can pass this explicitly.
  // Admin will be forced to own location in service layer.
  locationId: z.coerce.number().int().positive().optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    role: z.enum(allowedRoles).optional(),
    isActive: z.boolean().optional(),

    // Owner can move a user to another branch if needed.
    locationId: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.role !== undefined ||
      data.isActive !== undefined ||
      data.locationId !== undefined,
    {
      message:
        "At least one field (name, role, isActive, locationId) must be provided",
    },
  );

module.exports = { createUserSchema, updateUserSchema, allowedRoles };
