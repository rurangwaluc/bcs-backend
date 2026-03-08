const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerReportsOverview,
  getOwnerBranchPerformance,
  getOwnerFinancialSummary,
} = require("../controllers/ownerReportsController");

async function ownerReportsRoutes(app) {
  app.get(
    "/owner/reports/overview",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerReportsOverview,
  );

  app.get(
    "/owner/reports/branch-performance",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerBranchPerformance,
  );

  app.get(
    "/owner/reports/financial-summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerFinancialSummary,
  );
}

module.exports = { ownerReportsRoutes };
