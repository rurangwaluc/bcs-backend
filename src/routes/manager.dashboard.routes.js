const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  getManagerDashboard,
} = require("../controllers/managerDashboardController");

async function managerDashboardRoutes(app) {
  app.get(
    "/manager/dashboard",
    { preHandler: [requirePermission(ACTIONS.MANAGER_DASHBOARD_VIEW)] },
    getManagerDashboard,
  );
}

module.exports = { managerDashboardRoutes };
