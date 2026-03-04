// backend/src/validators/customers.schema.js
const { z } = require("zod");

const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  tin: z.string().min(3).max(30).optional(),
  address: z.string().min(2).max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const searchCustomerSchema = z.object({
  q: z.string().min(1).max(120),
  // owner may pass locationId; staff stays location-scoped in controller anyway
  locationId: z.coerce.number().int().positive().optional(),
});

// ✅ REQUIRED because controller uses it
const listCustomersQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const customerHistoryQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createCustomerSchema,
  searchCustomerSchema,
  listCustomersQuerySchema,
  customerHistoryQuerySchema,
};
