const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createStockRequest,
  approveStockRequest,
  releaseToSeller,
  listRequests
} = require("../controllers/requestsController");

async function requestsRoutes(app) {

    // ✅ NEW: unified list endpoint
  // seller -> sees own
  // store_keeper/admin/manager -> sees all (controller decides based on role)
  app.get(
    "/requests",
    {
      preHandler: [
        // anyone who can participate in requests can view them
        requirePermission(ACTIONS.STOCK_REQUEST_VIEW)
      ]
    },
    listRequests
  );
  // Seller creates request (limit)
  app.post(
    "/requests",
    {
      preHandler: [requirePermission(ACTIONS.STOCK_REQUEST_CREATE)],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    createStockRequest
  );

  // Store keeper approves/rejects (limit)
  app.post(
    "/requests/:id/approve",
    {
      preHandler: [requirePermission(ACTIONS.STOCK_REQUEST_APPROVE)],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    approveStockRequest
  ); 

  // Store keeper releases stock (limit)
  app.post(
    "/requests/:id/release",
    {
      preHandler: [requirePermission(ACTIONS.STOCK_RELEASE_TO_SELLER)],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    releaseToSeller
  );
}

module.exports = { requestsRoutes };
