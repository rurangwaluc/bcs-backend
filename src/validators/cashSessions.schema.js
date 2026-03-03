// backend/src/validators/cashSessions.schema.js

const { z } = require("zod");

const openCashSessionSchema = z.object({
  openingBalance: z.number().int().min(0).default(0),
});

/**
 * Production rule:
 * - Closing a session should NOT ask for a cash amount.
 * - Closing means: stop all new cash movements (lock session).
 * - Reconcile is where cashier enters counted cash.
 */
const closeCashSessionSchema = z.object({
  note: z.string().max(200).optional(),
});

module.exports = { openCashSessionSchema, closeCashSessionSchema };