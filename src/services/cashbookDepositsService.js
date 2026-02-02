// backend/src/services/cashDepositsService.js
const { db } = require("../config/db");
const { cashbookDeposits } = require("../db/schema/cashbook_deposits.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");

async function createDeposit({
  locationId,
  cashierId,
  cashSessionId,
  method,
  amount,
  reference,
  note,
}) {
  return db.transaction(async (tx) => {
    if (cashSessionId) {
      const sess = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.id, cashSessionId),
            eq(cashSessions.locationId, locationId),
          ),
        );

      if (!sess[0]) {
        const err = new Error("Cash session not found");
        err.code = "SESSION_NOT_FOUND";
        throw err;
      }
    }

    const safeMethod = String(method || "BANK").toUpperCase();

    const [created] = await tx
      .insert(cashbookDeposits)
      .values({
        locationId,
        cashierId,
        cashSessionId: cashSessionId || null,
        method: safeMethod,
        amount,
        reference: reference || null,
        note: note || null,
      })
      .returning();

    // ✅ FIX: audit_logs.location_id is NOT NULL in your DB
    await tx.insert(auditLogs).values({
      locationId, // ✅ ADDED
      userId: cashierId,
      action: "CASH_DEPOSIT_CREATE",
      entity: "cashbook_deposit",
      entityId: created.id,
      description: `Deposit amount=${amount}, method=${safeMethod}, ref=${reference || "-"}`,
    });

    return created;
  });
}

async function listDeposits({ locationId, limit = 50 }) {
  return db
    .select()
    .from(cashbookDeposits)
    .where(eq(cashbookDeposits.locationId, locationId))
    .orderBy(desc(cashbookDeposits.id))
    .limit(limit);
}

module.exports = { createDeposit, listDeposits };
