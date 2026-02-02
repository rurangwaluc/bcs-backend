const { z } = require("zod");

const createCashTxSchema = z.object({
  type: z.enum(["PETTY_CASH_IN", "PETTY_CASH_OUT", "VERSEMENT", "OPENING_BALANCE"]),
  amount: z.number().int().positive(),
  method: z.enum(["CASH", "MOMO", "BANK"]).optional(),
  note: z.string().optional()
});

module.exports = { createCashTxSchema };
