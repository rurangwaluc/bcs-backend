"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
} = require("../controllers/purchaseOrdersController");

async function purchaseOrdersRoutes(app) {
  const viewPermission =
    ACTIONS.PURCHASE_ORDER_VIEW ||
    ACTIONS.SUPPLIER_BILL_VIEW ||
    ACTIONS.SUPPLIER_VIEW;

  const createPermission =
    ACTIONS.PURCHASE_ORDER_CREATE ||
    ACTIONS.SUPPLIER_BILL_CREATE ||
    ACTIONS.SUPPLIER_CREATE;

  const updatePermission =
    ACTIONS.PURCHASE_ORDER_UPDATE ||
    ACTIONS.SUPPLIER_BILL_UPDATE ||
    ACTIONS.SUPPLIER_CREATE;

  const approvePermission =
    ACTIONS.PURCHASE_ORDER_APPROVE ||
    ACTIONS.SUPPLIER_BILL_UPDATE ||
    ACTIONS.SUPPLIER_CREATE;

  const cancelPermission =
    ACTIONS.PURCHASE_ORDER_CANCEL ||
    ACTIONS.SUPPLIER_BILL_UPDATE ||
    ACTIONS.SUPPLIER_CREATE;

  app.get(
    "/purchase-orders",
    { preHandler: [requirePermission(viewPermission)] },
    listPurchaseOrders,
  );

  app.get(
    "/purchase-orders/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getPurchaseOrderById,
  );

  app.post(
    "/purchase-orders",
    { preHandler: [requirePermission(createPermission)] },
    createPurchaseOrder,
  );

  app.patch(
    "/purchase-orders/:id",
    { preHandler: [requirePermission(updatePermission)] },
    updatePurchaseOrder,
  );

  app.post(
    "/purchase-orders/:id/approve",
    { preHandler: [requirePermission(approvePermission)] },
    approvePurchaseOrder,
  );

  app.post(
    "/purchase-orders/:id/cancel",
    { preHandler: [requirePermission(cancelPermission)] },
    cancelPurchaseOrder,
  );
}

module.exports = { purchaseOrdersRoutes };
