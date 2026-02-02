const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  ownerSummary,
  ownerLocations,
} = require("../controllers/ownerController");

async function ownerRoutes(app) {
  app.get(
    "/owner/locations",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    ownerLocations,
  );
  app.get(
    "/owner/summary",
    { preHandler: [requirePermission(ACTIONS.DASHBOARD_OWNER_VIEW)] },
    ownerSummary,
  );
}

module.exports = { ownerRoutes };
