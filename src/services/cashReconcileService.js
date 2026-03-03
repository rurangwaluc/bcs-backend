// backend/src/services/cashReconcileService.js

const { db } = require("../config/db");
const { cashReconciliations } = require("../db/schema/cash_reconciliations.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

function toMoneyNumber(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);

  if (typeof v === "string") {
    const cleaned = v.trim().replace(/[^\d-]/g, "");
    if (!cleaned) return NaN;
    return Number(cleaned);
  }
  return NaN;
}

function toInt(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "string") v = v.trim();
  return Number(v);
}

function makeErr(code, message, debug) {
  const err = new Error(message);
  err.code = code;
  if (debug) err.debug = debug;
  return err;
}

/**
 * STRICT reconcile:
 * - One reconcile per session (immutable once created)
 * - countedCash from client
 * - expectedCash computed by DB trigger/function
 * - session must be CLOSED
 */
async function createReconcile({ locationId, cashierId, cashSessionId, countedCash, note }) {
  const locId = toInt(locationId);
  const cashId = toInt(cashierId);
  const sessId = toInt(cashSessionId);

  if (!Number.isInteger(locId) || locId <= 0) throw makeErr("BAD_LOCATION", "Invalid locationId");
  if (!Number.isInteger(cashId) || cashId <= 0) throw makeErr("BAD_CASHIER", "Invalid cashierId");
  if (!Number.isInteger(sessId) || sessId <= 0) throw makeErr("BAD_SESSION", "Invalid cashSessionId");

  const cnt = toMoneyNumber(countedCash);
  if (!Number.isFinite(cnt) || cnt < 0) throw makeErr("BAD_AMOUNT", "Invalid countedCash");

  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;

  return db.transaction(async (tx) => {
    // 1) session exists + belongs to location
    const sessRows = await tx
      .select({
        id: cashSessions.id,
        locationId: cashSessions.locationId,
        cashierId: cashSessions.cashierId,
        status: cashSessions.status,
      })
      .from(cashSessions)
      .where(and(eq(cashSessions.id, sessId), eq(cashSessions.locationId, locId)));

    const sess = sessRows[0];
    if (!sess) throw makeErr("SESSION_NOT_FOUND", "Cash session not found");

    if (Number(sess.cashierId) !== cashId) throw makeErr("NOT_YOUR_SESSION", "This cash session is not yours");

    const st = String(sess.status || "").toUpperCase();
    if (st !== "CLOSED") {
      throw makeErr("SESSION_NOT_CLOSED", "Cash session must be CLOSED before reconciliation", {
        status: sess.status,
        cashSessionId: sessId,
      });
    }

    // 2) strict: block second reconcile attempt
    const exists = await tx.execute(sql`
      SELECT id FROM cash_reconciliations
      WHERE cash_session_id = ${sessId}
      LIMIT 1
    `);
    const rows = exists?.rows || exists || [];
    if (rows.length > 0) {
      throw makeErr("ALREADY_RECONCILED", "Cash session already reconciled");
    }

    // 3) insert (DB fills expected_cash, DB computes difference)
    const inserted = await tx
      .insert(cashReconciliations)
      .values({
        locationId: locId,
        cashSessionId: sessId,
        cashierId: cashId,
        countedCash: cnt,
        note: cleanNote,
      })
      .returning();

    const created = inserted[0];

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: cashId,
      action: "CASH_RECONCILE_CREATE",
      entity: "cash_reconciliation",
      entityId: created.id,
      description: `Reconcile cash session #${sessId}. counted=${cnt}`,
      meta: null,
    });

    // Normalize types for API (no string ids)
    return {
      id: Number(created.id),
      locationId: Number(created.locationId),
      cashSessionId: Number(created.cashSessionId),
      cashierId: Number(created.cashierId),
      expectedCash: Number(created.expectedCash),
      countedCash: Number(created.countedCash),
      difference: Number(created.difference),
      note: created.note ?? null,
      createdAt: created.createdAt,
    };
  });
}

async function listReconciles({ locationId, limit = 50 }) {
  const locId = toInt(locationId);
  if (!Number.isInteger(locId) || locId <= 0) throw makeErr("BAD_LOCATION", "Invalid locationId");

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const rows = await db
    .select()
    .from(cashReconciliations)
    .where(eq(cashReconciliations.locationId, locId))
    .orderBy(desc(cashReconciliations.createdAt))
    .limit(lim);

  // Normalize types
  return (rows || []).map((r) => ({
    id: Number(r.id),
    locationId: Number(r.locationId),
    cashSessionId: Number(r.cashSessionId),
    cashierId: Number(r.cashierId),
    expectedCash: Number(r.expectedCash),
    countedCash: Number(r.countedCash),
    difference: Number(r.difference),
    note: r.note ?? null,
    createdAt: r.createdAt,
  }));
}

module.exports = { createReconcile, listReconciles };