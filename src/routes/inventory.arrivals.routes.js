const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createArrival,
  listArrivals,
} = require("../controllers/inventoryArrivalsController");

async function inventoryArrivalRoutes(app) {
  // Storekeeper creates an arrival
  app.post(
    "/inventory/arrivals",
    { preHandler: [requirePermission(ACTIONS.INVENTORY_CREATE)] },
    createArrival,
  );

  // Manager/Admin/Owner view arrivals
  app.get(
    "/inventory/arrivals",
    { preHandler: [requirePermission(ACTIONS.INVENTORY_VIEW)] },
    listArrivals,
  );
}

module.exports = { inventoryArrivalRoutes };
