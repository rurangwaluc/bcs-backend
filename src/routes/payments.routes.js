const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { recordPayment } = require("../controllers/paymentsController");
const {
  listPayments,
  getPaymentsSummary,
} = require("../controllers/paymentsReadController");

async function paymentsRoutes(app) {
  // Record payment
  app.post(
    "/payments",
    {
      preHandler: [requirePermission(ACTIONS.PAYMENT_RECORD)],
    },
    recordPayment,
  );
}

module.exports = { paymentsRoutes };
