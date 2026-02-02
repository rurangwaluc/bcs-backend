const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { getSale, listSales } = require("../controllers/salesReadController");

async function salesReadRoutes(app) {
  app.get("/sales/:id", { preHandler: [requirePermission(ACTIONS.SALE_VIEW)] }, getSale);
  app.get("/sales", { preHandler: [requirePermission(ACTIONS.SALE_VIEW)] }, listSales);
}

module.exports = { salesReadRoutes };
