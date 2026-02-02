const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const controller = require("../controllers/stockArrivalController");

async function stockArrivalRoutes(app) {
  app.post(
    "/stock-arrivals",
    { preHandler: requirePermission(ACTIONS.STOCK_ARRIVAL_CREATE) },
    controller.createArrival,
  );

  app.get(
    "/stock-arrivals",
    { preHandler: requirePermission(ACTIONS.STOCK_ARRIVAL_VIEW) },
    controller.listArrivals,
  );

  app.post(
    "/stock-arrivals/:id/approve",
    { preHandler: requirePermission(ACTIONS.STOCK_ARRIVAL_DECIDE) },
    controller.approveArrival,
  );
}

module.exports = { stockArrivalRoutes };
