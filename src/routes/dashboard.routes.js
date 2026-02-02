const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

async function dashboardRoutes(app) {
  app.get(
    "/dashboard/owner",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    async (request) => {
      return {
        ok: true,
        message: "Owner dashboard endpoint (admin only)",
        user: request.user
      };
    }
  );
}

module.exports = { dashboardRoutes };
