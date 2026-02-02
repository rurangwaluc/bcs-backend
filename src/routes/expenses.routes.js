const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createExpense,
  listExpenses,
} = require("../controllers/expensesController");

async function expensesRoutes(app) {
  app.get(
    "/",
    { preHandler: [requirePermission(ACTIONS.EXPENSE_VIEW)] },
    listExpenses,
  );

  app.post(
    "/",
    { preHandler: [requirePermission(ACTIONS.EXPENSE_CREATE)] },
    createExpense,
  );
}

module.exports = { expensesRoutes };
