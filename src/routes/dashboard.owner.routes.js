const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { ownerSummary } = require("../controllers/dashboardController");

async function ownerDashboardRoutes(app) {
  app.get(
    "/dashboard/owner/summary",
    {
      preHandler: [
        requirePermission(ACTIONS.DASHBOARD_OWNER_VIEW || ACTIONS.OWNER_ONLY),
      ],
    },
    ownerSummary,
  );
}

module.exports = { ownerDashboardRoutes };
