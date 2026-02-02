const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  listPayments,
  getPaymentsSummary,
} = require("../controllers/paymentsReadController");

async function paymentsReadRoutes(app) {
  // ✅ manager/admin/cashier/owner can view payments list (read-only)
  app.get(
    "/payments",
    { preHandler: [requirePermission(ACTIONS.PAYMENT_VIEW)] },
    listPayments,
  );

  // ✅ manager/admin/cashier/owner can view payments summary (read-only)
  app.get(
    "/payments/summary",
    { preHandler: [requirePermission(ACTIONS.PAYMENT_VIEW)] },
    getPaymentsSummary,
  );
}

module.exports = { paymentsReadRoutes };
