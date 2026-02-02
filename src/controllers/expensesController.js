const { createExpenseSchema } = require("../validators/expenses.schema");
const expensesService = require("../services/expensesService");

async function createExpense(request, reply) {
  const parsed = createExpenseSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const expense = await expensesService.createExpense({
      locationId: request.user.locationId,
      cashierId: request.user.id,
      cashSessionId: parsed.data.cashSessionId,
      category: parsed.data.category,
      amount: parsed.data.amount,
      reference: parsed.data.reference,
      note: parsed.data.note,
    });

    return reply.send({ ok: true, expense });
  } catch (e) {
    if (e.code === "SESSION_NOT_FOUND")
      return reply.status(404).send({ error: e.message });
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listExpenses(request, reply) {
  try {
    const expenses = await expensesService.listExpenses({
      locationId: request.user.locationId,
    });

    return reply.send({ ok: true, expenses });
  } catch (e) {
    request.log.error(e);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createExpense, listExpenses };
