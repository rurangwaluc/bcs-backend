const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerProductsSummary,
  listOwnerProducts,
  getOwnerProductBranches,
  createOwnerProduct,
  updateOwnerProductPricing,
  archiveOwnerProduct,
  restoreOwnerProduct,
} = require("../controllers/ownerProductsController");

async function ownerProductsRoutes(app) {
  app.get(
    "/owner/products/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCTS_SUMMARY_VIEW)],
    },
    getOwnerProductsSummary,
  );

  app.get(
    "/owner/products",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCTS_VIEW)],
    },
    listOwnerProducts,
  );

  app.get(
    "/owner/products/:id/branches",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_BRANCHES_VIEW)],
    },
    getOwnerProductBranches,
  );

  app.post(
    "/owner/products",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_CREATE)],
    },
    createOwnerProduct,
  );

  app.put(
    "/owner/products/:id/pricing",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_PRICING_UPDATE)],
    },
    updateOwnerProductPricing,
  );

  app.patch(
    "/owner/products/:id/archive",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_ARCHIVE)],
    },
    archiveOwnerProduct,
  );

  app.patch(
    "/owner/products/:id/restore",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_RESTORE)],
    },
    restoreOwnerProduct,
  );
}

module.exports = { ownerProductsRoutes };
