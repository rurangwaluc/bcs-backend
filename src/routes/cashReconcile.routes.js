// backend/src/routes/cashReconcile.routes.js
const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createCashReconcile,
  listCashReconciles,
} = require("../controllers/cashReconcileController");

async function cashReconcileRoutes(app) {
  app.get(
    "/reconciles",
    { preHandler: [requirePermission(ACTIONS.CASH_RECONCILE_VIEW)] },
    listCashReconciles,
  );

  app.post(
    "/reconcile",
    { preHandler: [requirePermission(ACTIONS.CASH_RECONCILE_CREATE)] },
    createCashReconcile,
  );
}

module.exports = { cashReconcileRoutes };
