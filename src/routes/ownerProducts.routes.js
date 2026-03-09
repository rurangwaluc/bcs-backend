"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  getOwnerProductsSummary,
  listOwnerProducts,
  getOwnerProductBranches,
  createOwnerProduct,
  updateOwnerProduct,
  updateOwnerProductPricing,
  archiveOwnerProduct,
  restoreOwnerProduct,
} = require("../controllers/ownerProductsController");

async function ownerProductsRoutes(app) {
  app.get(
    "/owner/products/summary",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_VIEW)] },
    getOwnerProductsSummary,
  );

  app.get(
    "/owner/products",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_VIEW)] },
    listOwnerProducts,
  );

  app.get(
    "/owner/products/:id/branches",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_VIEW)] },
    getOwnerProductBranches,
  );

  app.post(
    "/owner/products",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_CREATE)] },
    createOwnerProduct,
  );

  app.patch(
    "/owner/products/:id",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_EDIT)] },
    updateOwnerProduct,
  );

  app.patch(
    "/owner/products/:id/pricing",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_EDIT)] },
    updateOwnerProductPricing,
  );

  app.post(
    "/owner/products/:id/archive",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_EDIT)] },
    archiveOwnerProduct,
  );

  app.post(
    "/owner/products/:id/restore",
    { preHandler: [requirePermission(ACTIONS.PRODUCT_EDIT)] },
    restoreOwnerProduct,
  );
}

module.exports = { ownerProductsRoutes };
