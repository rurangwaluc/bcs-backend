// backend/src/routes/credit.routes.js

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createCredit,
  approveCredit,
  settleCredit,
} = require("../controllers/creditController");

async function creditRoutes(app) {
  // Seller creates credit
  app.post(
    "/credits",
    { preHandler: [requirePermission(ACTIONS.CREDIT_CREATE)] },
    createCredit,
  );

  // Manager/Admin decide (approve/reject)
  app.patch(
    "/credits/:id/decision",
    { preHandler: [requirePermission(ACTIONS.CREDIT_DECIDE)] },
    approveCredit,
  );

  // ✅ Real-world: settling credit is its own permission
  app.patch(
    "/credits/:id/settle",
    { preHandler: [requirePermission(ACTIONS.CREDIT_SETTLE)] },
    settleCredit,
  );
}

module.exports = { creditRoutes };
