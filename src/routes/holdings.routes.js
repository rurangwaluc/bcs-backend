const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { myHoldings, sellerHoldings } = require("../controllers/holdingsController");

async function holdingsRoutes(app) {
  // Seller views own holding (no special permission needed beyond being logged in)
  app.get("/holdings", myHoldings);

  // Admin/Manager/StoreKeeper can view a seller's holdings
  app.get(
    "/holdings/seller/:sellerId",
    { preHandler: [requirePermission(ACTIONS.HOLDINGS_VIEW)] },
    sellerHoldings
  );
}

module.exports = { holdingsRoutes };
