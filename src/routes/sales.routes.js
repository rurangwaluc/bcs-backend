const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createSale,
  fulfillSale,
  markSale,
  cancelSale,
} = require("../controllers/salesController");
const { listSales, getSale } = require("../controllers/salesReadController");

async function salesRoutes(app) {
  // ✅ READ
  app.get(
    "/sales",
    {
      preHandler: [requirePermission(ACTIONS.SALE_VIEW)],
    },
    listSales,
  );

  // ✅ CREATE (Seller)
  app.post(
    "/sales",
    {
      preHandler: [requirePermission(ACTIONS.SALE_CREATE)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    createSale,
  );

  // ✅ FULFILL (Storekeeper) — DRAFT -> FULFILLED + inventory deduction
  app.post(
    "/sales/:id/fulfill",
    {
      preHandler: [requirePermission(ACTIONS.SALE_FULFILL)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    fulfillSale,
  );

  // ✅ MARK (Seller) — must be fulfilled first
  app.post(
    "/sales/:id/mark",
    {
      preHandler: [requirePermission(ACTIONS.SALE_MARK)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    markSale,
  );

  // ✅ CANCEL (Manager/Admin)
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
