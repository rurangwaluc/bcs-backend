const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerSalesSummary,
  listOwnerSales,
  getOwnerSale,
  ownerCancelSale,
  ownerMarkSale,
  ownerFulfillSale,
} = require("../controllers/ownerSalesController");

async function ownerSalesRoutes(app) {
  app.get(
    "/owner/sales/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerSalesSummary,
  );

  app.get(
    "/owner/sales",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerSales,
  );

  app.get(
    "/owner/sales/:id",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerSale,
  );

  app.post(
    "/owner/sales/:id/cancel",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    ownerCancelSale,
  );

  app.post(
    "/owner/sales/:id/mark",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    ownerMarkSale,
  );

  app.post(
    "/owner/sales/:id/fulfill",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    ownerFulfillSale,
  );
}

module.exports = { ownerSalesRoutes };
