// backend/src/services/expensesService.js
const { db } = require("../config/db");
const { expenses } = require("../db/schema/expenses.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { and, eq, desc } = require("drizzle-orm");

async function createExpense({
  locationId,
  cashierId,
  cashSessionId,
  category,
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

    const safeCategory = String(category || "GENERAL").toUpperCase();

    const [created] = await tx
      .insert(expenses)
      .values({
        locationId,
        cashierId,
        cashSessionId: cashSessionId || null,
        category: safeCategory,
        amount,
        reference: reference || null,
        note: note || null,
      })
      .returning();

    // ✅ FIX: audit_logs.location_id is NOT NULL in your DB
    await tx.insert(auditLogs).values({
      locationId, // ✅ ADDED
      userId: cashierId,
      action: "EXPENSE_CREATE",
      entity: "expense",
      entityId: created.id,
      description: `Expense amount=${amount}, category=${safeCategory}, ref=${reference || "-"}`,
    });

    return created;
  });
}

async function listExpenses({ locationId, limit = 50 }) {
  return db
    .select()
    .from(expenses)
    .where(eq(expenses.locationId, locationId))
    .orderBy(desc(expenses.id))
    .limit(limit);
}

module.exports = { createExpense, listExpenses };
