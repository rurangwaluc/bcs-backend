const { z } = require("zod");

const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  tin: z.string().min(1).max(30).optional(),
  address: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const searchCustomerSchema = z.object({
  q: z.string().min(1).max(120),
  locationId: z.coerce.number().int().positive().optional(),
});

const listCustomersQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.coerce.number().int().positive().optional(),
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
