const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { createCashTx, listLedger, todaySummary } = require("../controllers/cashController");

async function cashRoutes(app) {
  // Manual ledger tx (admin/owner only)
  app.post(
    "/cash/tx", 
    {
      preHandler: [requirePermission(ACTIONS.CASH_LEDGER_MANAGE)],
      config: { rateLimit: { max: 60, timeWindow: 60000 } },
    },
    createCashTx
  );

  // ✅ Ledger view (cashier/manager/admin/owner)
  app.get(
    "/cash/ledger",
    { preHandler: [requirePermission(ACTIONS.CASH_LEDGER_VIEW)] },
    listLedger
  );

  // ✅ Today summary (cashier/manager/admin/owner)
  app.get(
    "/cash/summary/today",
    { preHandler: [requirePermission(ACTIONS.CASH_LEDGER_VIEW)] },
    todaySummary
  );
}

module.exports = { cashRoutes };