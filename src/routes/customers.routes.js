const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { createCustomer, searchCustomers, getCustomerHistory } = require("../controllers/customersController");

async function customersRoutes(app) {
  app.post("/customers", { preHandler: [requirePermission(ACTIONS.CUSTOMER_CREATE)] }, createCustomer);
  app.get("/customers/search", { preHandler: [requirePermission(ACTIONS.CUSTOMER_VIEW)] }, searchCustomers);
  app.get("/customers/:id/history", { preHandler: [requirePermission(ACTIONS.CUSTOMER_VIEW)] }, getCustomerHistory);
}

module.exports = { customersRoutes };
