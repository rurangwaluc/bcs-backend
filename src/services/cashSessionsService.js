// backend/src/services/cashSessionsService.js

const { db } = require("../config/db");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

function makeErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normSessionRow(s) {
  if (!s) return null;
  return {
    id: Number(s.id),
    locationId: Number(s.locationId),
    cashierId: Number(s.cashierId),
    status: String(s.status),
    openedAt: s.openedAt,
    closedAt: s.closedAt ?? null,
    openingBalance: Number(s.openingBalance ?? 0),
    closingBalance: Number(s.closingBalance ?? 0),
    updatedAt: s.updatedAt,
  };
}

async function openSession({ locationId, cashierId, openingBalance }) {
  return db.transaction(async (tx) => {
    // Ensure no other OPEN session for this cashier at this location
    const existing = await tx
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.locationId, locationId),
          eq(cashSessions.cashierId, cashierId),
          eq(cashSessions.status, "OPEN")
        )
      )
      .limit(1);

    if (existing.length) throw makeErr("SESSION_ALREADY_OPEN", "You already have an OPEN cash session");

    const [created] = await tx
      .insert(cashSessions)
      .values({
        locationId,
        cashierId,
        status: "OPEN",
        openingBalance: openingBalance ?? 0,
        openedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId: cashierId,
      action: "CASH_SESSION_OPEN",
      entity: "cash_session",
      entityId: created.id,
      description: `Cash session opened. openingBalance=${openingBalance ?? 0}`,
    });

    return normSessionRow(created);
  });
}

async function closeSession({ locationId, cashierId, sessionId, note }) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.locationId, locationId)));

    const session = rows[0];
    if (!session) throw makeErr("NOT_FOUND", "Cash session not found");

    if (Number(session.cashierId) !== Number(cashierId)) throw makeErr("FORBIDDEN", "Forbidden");

    if (String(session.status) !== "OPEN") throw makeErr("BAD_STATUS", "Cash session already closed");

    // System-computed closing balance (expected cash at close time)
    // Uses your DB function; cast to bigint input to match your overload.
    const computed = await tx.execute(sql`
      SELECT public.compute_expected_cash(${sessionId}::bigint) as expected_cash
    `);
    const computedRows = computed?.rows || computed || [];
    const expectedCash = Number(computedRows?.[0]?.expected_cash ?? 0);

    const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;

    const [updated] = await tx
      .update(cashSessions)
      .set({
        status: "CLOSED",
        closingBalance: expectedCash,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cashSessions.id, sessionId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId: cashierId,
      action: "CASH_SESSION_CLOSE",
      entity: "cash_session",
      entityId: sessionId,
      description: `Cash session closed. closingBalance=${expectedCash}. note=${cleanNote || "-"}`,
    });

    return normSessionRow(updated);
  });
}

async function listMySessions({ locationId, cashierId, limit = 30 }) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 200);

  const rows = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.locationId, locationId), eq(cashSessions.cashierId, cashierId)))
    .orderBy(desc(cashSessions.id))
    .limit(lim);

  return (rows || []).map(normSessionRow);
}

module.exports = { openSession, closeSession, listMySessions };