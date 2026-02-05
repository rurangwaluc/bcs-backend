// backend/src/routes/payments.read.routes.js
const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  listPayments,
  getPaymentsSummary,
  getPaymentsBreakdown,
} = require("../controllers/paymentsReadController");

async function paymentsReadRoutes(app) {
  // ✅ view payments list (read-only)
  app.get(
    "/payments",
    { preHandler: [requirePermission(ACTIONS.PAYMENT_VIEW)] },
    listPayments,
  );

  // ✅ view payments summary (today / yesterday / all time)
  app.get(
    "/payments/summary",
    { preHandler: [requirePermission(ACTIONS.PAYMENT_VIEW)] },
    getPaymentsSummary,
  );

  // ✅ view payments breakdown by method (cash/momo/bank/card/other)
  app.get(
    "/payments/breakdown",
    { preHandler: [requirePermission(ACTIONS.PAYMENT_VIEW)] },
    getPaymentsBreakdown,
  );
}

module.exports = { paymentsReadRoutes };
