// backend/src/routes/inventory.routes.js
const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createProduct,
  listProducts,
  listInventory,
  adjustInventory,
  updateProductPricing,
  archiveProduct,
  restoreProduct,
  deleteProduct,
} = require("../controllers/inventoryController");

async function inventoryRoutes(app) {
  // products
  app.post(
    "/products",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_CREATE)] },
    createProduct,
  );

  app.get(
    "/products",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_VIEW)] },
    listProducts,
  );

  // ✅ pricing update (manager/admin/owner)
  app.put(
    "/products/:id/pricing",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_PRICING_UPDATE)] },
    updateProductPricing,
  );

  // ✅ archive/restore/delete (you can control permissions here)
  app.patch(
    "/products/:id/archive",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_UPDATE)] },
    archiveProduct,
  );

  app.patch(
    "/products/:id/restore",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_UPDATE)] },
    restoreProduct,
  );

  // Hard delete is dangerous: lock it to admin/owner only
  app.delete(
    "/products/:id",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_DELETE)] },
    deleteProduct,
  );

  // inventory
  app.get(
    "/inventory",
    { preHandler: [requirePermission(ACTIONS.INVENTORY_VIEW)] },
    listInventory,
  );

  app.post(
    "/inventory/adjust",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST)],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    adjustInventory,
  );
}

module.exports = { inventoryRoutes };
