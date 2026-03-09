"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createInventoryArrival,
  listInventoryArrivals,
  getInventoryArrivalById,
} = require("../controllers/inventoryArrivalsController");

async function inventoryArrivalRoutes(app) {
  const viewPermission =
    ACTIONS.INVENTORY_ARRIVAL_VIEW || ACTIONS.INVENTORY_VIEW;
  const createPermission =
    ACTIONS.INVENTORY_ARRIVAL_CREATE || ACTIONS.INVENTORY_CREATE;

  // New clean routes
  app.get(
    "/inventory-arrivals",
    { preHandler: [requirePermission(viewPermission)] },
    listInventoryArrivals,
  );

  app.get(
    "/inventory-arrivals/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getInventoryArrivalById,
  );

  app.post(
    "/inventory-arrivals",
    { preHandler: [requirePermission(createPermission)] },
    createInventoryArrival,
  );

  // Backward-compatible aliases
  app.get(
    "/inventory/arrivals",
    { preHandler: [requirePermission(viewPermission)] },
    listInventoryArrivals,
  );

  app.get(
    "/inventory/arrivals/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getInventoryArrivalById,
  );

  app.post(
    "/inventory/arrivals",
    { preHandler: [requirePermission(createPermission)] },
    createInventoryArrival,
  );
}

module.exports = { inventoryArrivalRoutes };
