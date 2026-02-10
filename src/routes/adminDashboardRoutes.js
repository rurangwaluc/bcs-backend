const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  getAdminDashboard,
} = require("../controllers/adminDashboardController");

async function adminDashboardRoutes(app) {
  app.get(
    "/admin/dashboard",
    { preHandler: [requirePermission(ACTIONS.ADMIN_DASHBOARD_VIEW)] },
    getAdminDashboard,
  );
}

module.exports = { adminDashboardRoutes };
