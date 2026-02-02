const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createSale,
  markSale,
  cancelSale,
} = require("../controllers/salesController");

async function salesRoutes(app) {
  // Seller creates sale (limit)
  app.post(
    "/sales",
    {
      preHandler: [requirePermission(ACTIONS.SALE_CREATE)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    createSale,
  );

  // Seller marks PAID/PENDING (limit)
  app.post(
    "/sales/:id/mark",
    {
      preHandler: [requirePermission(ACTIONS.SALE_MARK)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    markSale,
  );

  // Manager/Admin cancels sale (limit)
  app.post(
    "/sales/:id/cancel",
    {
      preHandler: [requirePermission(ACTIONS.SALE_CANCEL)],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    cancelSale,
  );
}

module.exports = { salesRoutes };
