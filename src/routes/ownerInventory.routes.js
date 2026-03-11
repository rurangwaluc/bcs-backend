"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerInventorySummary,
  listOwnerInventory,
  getOwnerProductInventory,
  adjustOwnerInventory,
} = require("../controllers/ownerInventoryController");

async function ownerInventoryRoutes(app) {
  app.get(
    "/owner/inventory/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_INVENTORY_SUMMARY_VIEW)],
    },
    getOwnerInventorySummary,
  );

  app.get(
    "/owner/inventory",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_INVENTORY_VIEW)],
    },
    listOwnerInventory,
  );

  app.get(
    "/owner/products/:id/inventory",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_PRODUCT_INVENTORY_VIEW)],
    },
    getOwnerProductInventory,
  );

  app.post(
    "/owner/inventory/adjust",
    {
      preHandler: [requirePermission(ACTIONS.INVENTORY_ADJUST)],
    },
    adjustOwnerInventory,
  );
}

module.exports = { ownerInventoryRoutes };
