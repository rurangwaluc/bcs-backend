const { z } = require("zod");

const openCashSessionSchema = z.object({
  openingBalance: z.number().int().min(0).default(0),
});

const closeCashSessionSchema = z.object({
  closingBalance: z.number().int().min(0),
  note: z.string().max(200).optional(),
});

module.exports = { openCashSessionSchema, closeCashSessionSchema };
