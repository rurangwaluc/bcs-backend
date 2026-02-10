// backend/src/routes/productPricingRoutes.js
const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  updateProductPricing,
  getProductsController,
} = require("../controllers/productPricingController");

// backend/src/routes/productPricing.routes.js
async function productPricingRoutes(app) {
  app.get(
    "/product-pricing",
    {
      preHandler: [requirePermission(ACTIONS.ADMIN_DASHBOARD_VIEW)],
    },
    getProductsController,
  );

  app.patch(
    "/products/:id/pricing",
    {
      preHandler: [requirePermission(ACTIONS.PRODUCT_PRICING_MANAGE)],
    },
    updateProductPricing,
  );
}

module.exports = { productPricingRoutes };
