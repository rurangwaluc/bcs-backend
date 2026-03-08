const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  listOwnerPayments,
  getOwnerPaymentsSummary,
  getOwnerPaymentsBreakdown,
} = require("../controllers/ownerPaymentsController");

async function ownerPaymentsRoutes(app) {
  app.get(
    "/owner/payments",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerPayments,
  );

  app.get(
    "/owner/payments/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerPaymentsSummary,
  );

  app.get(
    "/owner/payments/breakdown",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerPaymentsBreakdown,
  );
}

module.exports = { ownerPaymentsRoutes };
