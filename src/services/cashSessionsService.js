// backend/src/services/cashSessionsService.js
const { db } = require("../config/db");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");

async function openSession({ locationId, cashierId, openingBalance }) {
  return db.transaction(async (tx) => {
    // Ensure no other OPEN session for this cashier at this location
    const existing = await tx
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.locationId, locationId),
          eq(cashSessions.cashierId, cashierId),
          eq(cashSessions.status, "OPEN"),
        ),
      );

    if (existing.length) {
      const err = new Error("You already have an OPEN cash session");
      err.code = "SESSION_ALREADY_OPEN";
      throw err;
    }

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

    // ✅ FIX: audit_logs.location_id is NOT NULL in your DB, so always write it
    await tx.insert(auditLogs).values({
      locationId, // ✅ ADDED
      userId: cashierId,
      action: "CASH_SESSION_OPEN",
      entity: "cash_session",
      entityId: created.id,
      description: `Cash session opened. openingBalance=${openingBalance ?? 0}`,
    });

    return created;
  });
}

async function closeSession({
  locationId,
  cashierId,
  sessionId,
  closingBalance,
  note,
}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.id, sessionId),
          eq(cashSessions.locationId, locationId),
        ),
      );

    const session = rows[0];
    if (!session) {
      const err = new Error("Cash session not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (Number(session.cashierId) !== Number(cashierId)) {
      const err = new Error("Forbidden");
      err.code = "FORBIDDEN";
      throw err;
    }

    if (String(session.status) !== "OPEN") {
      const err = new Error("Cash session already closed");
      err.code = "BAD_STATUS";
      throw err;
    }

    const [updated] = await tx
      .update(cashSessions)
      .set({
        status: "CLOSED",
        closingBalance,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cashSessions.id, sessionId))
      .returning();

    // ✅ FIX: audit must include locationId
    await tx.insert(auditLogs).values({
      locationId, // ✅ ADDED
      userId: cashierId,
      action: "CASH_SESSION_CLOSE",
      entity: "cash_session",
      entityId: sessionId,
      description: `Cash session closed. closingBalance=${closingBalance}. note=${note || "-"}`,
    });

    return updated;
  });
}

async function listMySessions({ locationId, cashierId, limit = 30 }) {
  return db
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.locationId, locationId),
        eq(cashSessions.cashierId, cashierId),
      ),
    )
    .orderBy(desc(cashSessions.id))
    .limit(limit);
}

module.exports = { openSession, closeSession, listMySessions };
