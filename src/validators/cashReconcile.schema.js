// backend/src/validators/cashReconcile.schema.js
const { z } = require("zod");

// Accept numbers like: 250000, "250000", "250,000", "250 000"
function moneyInt(label) {
  return z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return v;

      if (typeof v === "string") {
        // remove commas/spaces so "250,000" or "250 000" becomes "250000"
        v = v.replace(/[, ]+/g, "");
      }

      return v;
    },
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int()
      .min(0),
  );
}

// Accept id like: 4, "4"
function idInt(label) {
  return z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return v;
      if (typeof v === "string") v = v.trim();
      return v;
    },
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int()
      .positive(),
  );
}

/**
 * This preprocess step lets your frontend send any of these keys:
 * - cashSessionId (camel)
 * - cash_session_id (snake)
 * - sessionId (common UI naming)
 * Same for expected/counted cash.
 */
const createCashReconcileSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object") return input;

    const o = { ...input };

    // Normalize session id keys
    if (o.cashSessionId == null && o.cash_session_id != null)
      o.cashSessionId = o.cash_session_id;
    if (o.cashSessionId == null && o.sessionId != null)
      o.cashSessionId = o.sessionId;

    // Normalize money keys
    if (o.expectedCash == null && o.expected_cash != null)
      o.expectedCash = o.expected_cash;
    if (o.countedCash == null && o.counted_cash != null)
      o.countedCash = o.counted_cash;

    // Normalize note
    if (typeof o.note === "string" && o.note.trim() === "") o.note = undefined;

    return o;
  },
  z.object({
    cashSessionId: idInt("cashSessionId"),
    expectedCash: moneyInt("expectedCash"),
    countedCash: moneyInt("countedCash"),
    note: z.string().trim().max(200).optional(),
  }),
);

module.exports = { createCashReconcileSchema };
