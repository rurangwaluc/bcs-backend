const { z } = require("zod");

const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  notes: z.string().max(2000).optional(),
});

const searchCustomerSchema = z.object({
  q: z.string().min(1).max(120),
  // owner may pass locationId; staff stays location-scoped in controller anyway
  locationId: z.coerce.number().int().positive().optional(),
});

const customerHistoryQuerySchema = z.object({
  // optional for owner multi-location; ignored for non-owner
  locationId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createCustomerSchema,
  searchCustomerSchema,
  customerHistoryQuerySchema,
};
