const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { createCashTx, listLedger, todaySummary } = require("../controllers/cashController");

async function cashRoutes(app) {
  // Cashier only (permission-enforced)
  app.post(
    "/cash/tx",
    {
      preHandler: [requirePermission(ACTIONS.CASH_LEDGER_MANAGE)],
      config: { rateLimit: { max: 60, timeWindow: 60000 } }
    },
    createCashTx
  );

  app.get(
    "/cash/ledger",
    { preHandler: [requirePermission(ACTIONS.CASH_LEDGER_MANAGE)] },
    listLedger
  );

  app.get(
    "/cash/summary/today",
    { preHandler: [requirePermission(ACTIONS.CASH_LEDGER_MANAGE)] },
    todaySummary
  );
}

module.exports = { cashRoutes };
