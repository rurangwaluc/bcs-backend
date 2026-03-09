"use strict";

const { z } = require("zod");

const createExpenseSchema = z.object({
  // owner can choose branch; staff-side can ignore/override in controller
  locationId: z.coerce.number().int().positive().optional(),

  cashSessionId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(1).max(60).default("GENERAL"),
  amount: z.coerce.number().int().positive(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
});

const listExpensesQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  cashSessionId: z.coerce.number().int().positive().optional(),
  cashierId: z.coerce.number().int().positive().optional(),

  category: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(200).optional(),

  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),

  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = {
  createExpenseSchema,
  listExpensesQuerySchema,
};
