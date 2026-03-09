"use strict";

const {
  createExpenseSchema,
  listExpensesQuerySchema,
} = require("../validators/expenses.schema");
const expensesService = require("../services/expensesService");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function parseIsoDateStart(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseIsoDateEndExclusive(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;

  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function createExpense(request, reply) {
  const parsed = createExpenseSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  const isOwner = normalizeRole(request.user?.role) === "owner";
  const effectiveLocationId = isOwner
    ? parsed.data.locationId || request.user.locationId
    : request.user.locationId;

  try {
    const expense = await expensesService.createExpense({
      locationId: effectiveLocationId,
      cashierId: request.user.id,
      cashSessionId: parsed.data.cashSessionId,
      category: parsed.data.category,
      amount: parsed.data.amount,
      reference: parsed.data.reference,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, expense });
  } catch (e) {
    if (e.code === "SESSION_NOT_FOUND") {
      return reply.status(404).send({ error: e.message });
    }

    request.log.error({ err: e }, "createExpense failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listExpenses(request, reply) {
  const parsed = listExpensesQuerySchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  try {
    const isOwner = normalizeRole(request.user?.role) === "owner";
    const effectiveLocationId = isOwner
      ? (parsed.data.locationId ?? null)
      : request.user.locationId;

    const result = await expensesService.listExpenses({
      locationId: effectiveLocationId,
      cashSessionId: parsed.data.cashSessionId ?? null,
      cashierId: parsed.data.cashierId ?? null,
      category: parsed.data.category ?? null,
      q: parsed.data.q ?? null,
      from: parseIsoDateStart(parsed.data.from),
      toExclusive: parseIsoDateEndExclusive(parsed.data.to),
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit ?? 50,
    });

    return reply.send({
      ok: true,
      expenses: result.rows,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    request.log.error({ err: e }, "listExpenses failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = {
  createExpense,
  listExpenses,
};
