// backend/src/validators/cashReconcile.schema.js

const { z } = require("zod");

// money like: 250000, "250000", "250,000", "250 000", "RWF 250,000"
function moneyInt(label) {
  return z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return v;
      if (typeof v === "string") return v.trim().replace(/[^\d-]/g, "");
      return v;
    },
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int()
      .min(0)
  );
}

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
      .positive()
  );
}

const createCashReconcileSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object") return input;
    const o = { ...input };

    if (o.cashSessionId == null && o.cash_session_id != null) o.cashSessionId = o.cash_session_id;
    if (o.cashSessionId == null && o.sessionId != null) o.cashSessionId = o.sessionId;

    if (o.countedCash == null && o.counted_cash != null) o.countedCash = o.counted_cash;

    // ignore expected cash inputs (never trusted)
    delete o.expectedCash;
    delete o.expected_cash;

    if (typeof o.note === "string" && o.note.trim() === "") o.note = undefined;

    return o;
  },
  z.object({
    cashSessionId: idInt("cashSessionId"),
    countedCash: moneyInt("countedCash"),
    note: z.string().trim().max(200).optional(),
  })
);

module.exports = { createCashReconcileSchema };