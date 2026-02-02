const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  openCashSession,
  closeCashSession,
  listMyCashSessions,
} = require("../controllers/cashSessionsController");

async function cashSessionsRoutes(app) {
  app.get(
    "/mine",
    { preHandler: [requirePermission(ACTIONS.CASH_SESSION_VIEW)] },
    listMyCashSessions,
  );

  app.post(
    "/open",
    { preHandler: [requirePermission(ACTIONS.CASH_SESSION_OPEN)] },
    openCashSession,
  );

  app.post(
    "/:id/close",
    { preHandler: [requirePermission(ACTIONS.CASH_SESSION_CLOSE)] },
    closeCashSession,
  );
}

module.exports = { cashSessionsRoutes };
