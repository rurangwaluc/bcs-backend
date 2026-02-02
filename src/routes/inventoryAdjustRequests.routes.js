// backend/src/routes/inventoryAdjustRequests.routes.js
const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createAdjustRequest,
  listAdjustRequests,
  listMineAdjustRequests,
  approveAdjustRequest,
  declineAdjustRequest,
} = require("../controllers/inventoryAdjustRequestsController");

async function inventoryAdjustRequestsRoutes(app) {
  // Storekeeper creates adjustment request
  app.post(
    "/inventory-adjust-requests",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST_REQUEST_CREATE)],
    },
    createAdjustRequest,
  );

  // ✅ Storekeeper lists ONLY their own requests
  // Important: protect it so request.user is always present (or you get 401/403 cleanly)
  app.get(
    "/inventory-adjust-requests/mine",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST_REQUEST_CREATE)],
    },
    listMineAdjustRequests,
  );

  // Manager/admin/owner list requests
  app.get(
    "/inventory-adjust-requests",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST_REQUEST_VIEW)],
    },
    listAdjustRequests,
  );

  // Approve/decline
  app.post(
    "/inventory-adjust-requests/:id/approve",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST_REQUEST_DECIDE)],
    },
    approveAdjustRequest,
  );

  app.post(
    "/inventory-adjust-requests/:id/decline",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST_REQUEST_DECIDE)],
    },
    declineAdjustRequest,
  );
}

module.exports = { inventoryAdjustRequestsRoutes };
