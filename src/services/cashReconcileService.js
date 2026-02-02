// backend/src/services/cashReconcilesService.js  (name it whatever you currently use)
const { db } = require("../config/db");
const {
  cashReconciliations,
} = require("../db/schema/cash_reconciliations.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");

async function createReconcile({
  locationId,
  cashierId,
  cashSessionId,
  expectedCash,
  countedCash,
  note,
}) {
  return db.transaction(async (tx) => {
    // Find the cash session (location-safe)
    const sessRows = await tx
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.id, cashSessionId),
          eq(cashSessions.locationId, locationId),
        ),
      );

    const sess = sessRows[0];
    if (!sess) {
      const err = new Error("Cash session not found");
      err.code = "SESSION_NOT_FOUND";
      throw err;
    }

    // DB computes difference (good)
    const [created] = await tx
      .insert(cashReconciliations)
      .values({
        locationId,
        cashSessionId,
        cashierId,
        expectedCash,
        countedCash,
        note: note || null,
      })
      .returning();

    // ✅ FIX: include locationId because audit_logs.location_id is NOT NULL
    await tx.insert(auditLogs).values({
      locationId, // ✅ ADDED
      userId: cashierId,
      action: "CASH_RECONCILE_CREATE",
      entity: "cash_reconciliation",
      entityId: created.id,
      description: `Reconcile session=${cashSessionId}, expected=${expectedCash}, counted=${countedCash}`,
    });

    return created;
  });
}

async function listReconciles({ locationId, limit = 50 }) {
  return db
    .select()
    .from(cashReconciliations)
    .where(eq(cashReconciliations.locationId, locationId))
    .orderBy(desc(cashReconciliations.id))
    .limit(limit);
}

module.exports = { createReconcile, listReconciles };
