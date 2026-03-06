const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  ownerSummary,
  ownerLocations,
  createLocation,
  updateLocation,
  closeLocation,
  reopenLocation,
  archiveLocation,
} = require("../controllers/ownerController");

async function ownerRoutes(app) {
  app.get(
    "/owner/locations",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    ownerLocations,
  );

  app.post(
    "/owner/locations",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    createLocation,
  );

  app.patch(
    "/owner/locations/:id",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    updateLocation,
  );

  app.post(
    "/owner/locations/:id/close",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    closeLocation,
  );

  app.post(
    "/owner/locations/:id/reopen",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    reopenLocation,
  );

  app.post(
    "/owner/locations/:id/archive",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    archiveLocation,
  );

  app.get(
    "/owner/summary",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    ownerSummary,
  );
}

module.exports = { ownerRoutes };
