const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  updateProductPricing,
} = require("../controllers/productPricingController");

async function productPricingRoutes(app) {
  app.patch(
    "/products/:id/pricing",
    {
      preHandler: [requirePermission(ACTIONS.PRODUCT_PRICING_MANAGE)],
    },
    updateProductPricing,
  );
}

module.exports = { productPricingRoutes };
