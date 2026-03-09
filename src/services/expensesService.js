"use strict";

const { db } = require("../config/db");
const { expenses } = require("../db/schema/expenses.schema");
const { cashSessions } = require("../db/schema/cash_sessions.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, sql } = require("drizzle-orm");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

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
    const locId = toInt(locationId, null);
    const actorId = toInt(cashierId, null);
    const sessionId = toInt(cashSessionId, null);
    const safeAmount = toInt(amount, 0);

    if (!locId) {
      const err = new Error("locationId is required");
      err.code = "BAD_LOCATION";
      throw err;
    }

    if (!actorId) {
      const err = new Error("cashierId is required");
      err.code = "BAD_CASHIER";
      throw err;
    }

    if (!safeAmount || safeAmount <= 0) {
      const err = new Error("amount must be greater than zero");
      err.code = "BAD_AMOUNT";
      throw err;
    }

    if (sessionId) {
      const sess = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.id, sessionId),
            eq(cashSessions.locationId, locId),
          ),
        )
        .limit(1);

      if (!sess[0]) {
        const err = new Error("Cash session not found");
        err.code = "SESSION_NOT_FOUND";
        throw err;
      }
    }

    const safeCategory = String(category || "GENERAL")
      .trim()
      .toUpperCase()
      .slice(0, 60);

    const safeReference = cleanText(reference, 80);
    const safeNote = cleanText(note, 200);

    const [created] = await tx
      .insert(expenses)
      .values({
        locationId: locId,
        cashierId: actorId,
        cashSessionId: sessionId || null,
        category: safeCategory,
        amount: safeAmount,
        reference: safeReference,
        note: safeNote,
      })
      .returning();

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: actorId,
      action: "EXPENSE_CREATE",
      entity: "expense",
      entityId: created.id,
      description: `Expense created amount=${safeAmount}, category=${safeCategory}, ref=${safeReference || "-"}`,
      meta: {
        expenseId: created.id,
        amount: safeAmount,
        category: safeCategory,
        cashSessionId: sessionId || null,
      },
    });

    return {
      id: Number(created.id),
      locationId: Number(created.locationId),
      cashSessionId:
        created.cashSessionId == null ? null : Number(created.cashSessionId),
      cashierId: Number(created.cashierId),
      category: String(created.category || "GENERAL"),
      amount: Number(created.amount || 0),
      reference: created.reference ?? null,
      note: created.note ?? null,
      createdAt: created.createdAt,
    };
  });
}

async function listExpenses({
  locationId = null,
  cashSessionId = null,
  cashierId = null,
  category = null,
  q = null,
  from = null,
  toExclusive = null,
  cursor = null,
  limit = 50,
}) {
  const lim = clampInt(limit, 1, 200, 50);
  const cursorId = toInt(cursor, null);
  const locationIdInt = toInt(locationId, null);
  const cashSessionIdInt = toInt(cashSessionId, null);
  const cashierIdInt = toInt(cashierId, null);
  const categoryValue = category
    ? String(category).trim().toUpperCase().slice(0, 60)
    : null;
  const qValue = cleanText(q, 200);

  let where = sql`TRUE`;

  if (locationIdInt != null) {
    where = sql`${where} AND e.location_id = ${locationIdInt}`;
  }

  if (cursorId != null && cursorId > 0) {
    where = sql`${where} AND e.id < ${cursorId}`;
  }

  if (cashSessionIdInt != null && cashSessionIdInt > 0) {
    where = sql`${where} AND e.cash_session_id = ${cashSessionIdInt}`;
  }

  if (cashierIdInt != null && cashierIdInt > 0) {
    where = sql`${where} AND e.cashier_id = ${cashierIdInt}`;
  }

  if (categoryValue) {
    where = sql`${where} AND e.category = ${categoryValue}`;
  }

  if (from) {
    where = sql`${where} AND e.created_at >= ${from}`;
  }

  if (toExclusive) {
    where = sql`${where} AND e.created_at < ${toExclusive}`;
  }

  if (qValue) {
    const like = `%${qValue}%`;
    where = sql`${where} AND (
      CAST(e.id AS text) ILIKE ${like}
      OR CAST(e.amount AS text) ILIKE ${like}
      OR COALESCE(e.category, '') ILIKE ${like}
      OR COALESCE(e.reference, '') ILIKE ${like}
      OR COALESCE(e.note, '') ILIKE ${like}
      OR COALESCE(l.name, '') ILIKE ${like}
      OR COALESCE(l.code, '') ILIKE ${like}
      OR COALESCE(u.name, '') ILIKE ${like}
      OR COALESCE(u.email, '') ILIKE ${like}
    )`;
  }

  const result = await db.execute(sql`
    SELECT
      e.id,
      e.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      e.cash_session_id as "cashSessionId",
      e.cashier_id as "cashierId",
      u.name as "cashierName",
      u.email as "cashierEmail",

      e.category,
      e.amount,
      e.reference,
      e.note,
      e.created_at as "createdAt"
    FROM expenses e
    JOIN locations l
      ON l.id = e.location_id
    LEFT JOIN users u
      ON u.id = e.cashier_id
    WHERE ${where}
    ORDER BY e.id DESC
    LIMIT ${lim}
  `);

  const rows = (result.rows || result || []).map((row) => ({
    id: Number(row.id),
    locationId: Number(row.locationId),
    locationName: row.locationName ?? null,
    locationCode: row.locationCode ?? null,
    cashSessionId: row.cashSessionId == null ? null : Number(row.cashSessionId),
    cashierId: row.cashierId == null ? null : Number(row.cashierId),
    cashierName: row.cashierName ?? null,
    cashierEmail: row.cashierEmail ?? null,
    category: String(row.category || "GENERAL"),
    amount: Number(row.amount || 0),
    reference: row.reference ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
  }));

  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

module.exports = {
  createExpense,
  listExpenses,
};
