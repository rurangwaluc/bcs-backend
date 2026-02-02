const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createDeposit,
  listDeposits,
} = require("../controllers/cashbookDepositsController");

async function cashbookRoutes(app) {
  app.get(
    "/deposits",
    { preHandler: [requirePermission(ACTIONS.CASH_DEPOSIT_VIEW)] },
    listDeposits,
  );

  app.post(
    "/deposits",
    { preHandler: [requirePermission(ACTIONS.CASH_DEPOSIT_CREATE)] },
    createDeposit,
  );
}

module.exports = { cashbookRoutes };
