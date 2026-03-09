"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createGoodsReceipt,
  listGoodsReceipts,
  getGoodsReceiptById,
} = require("../controllers/goodsReceiptsController");

async function goodsReceiptsRoutes(app) {
  const viewPermission =
    ACTIONS.GOODS_RECEIPT_VIEW ||
    ACTIONS.INVENTORY_ARRIVAL_VIEW ||
    ACTIONS.INVENTORY_VIEW;

  const createPermission =
    ACTIONS.GOODS_RECEIPT_CREATE ||
    ACTIONS.INVENTORY_ARRIVAL_CREATE ||
    ACTIONS.INVENTORY_CREATE;

  app.get(
    "/goods-receipts",
    { preHandler: [requirePermission(viewPermission)] },
    listGoodsReceipts,
  );

  app.get(
    "/goods-receipts/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getGoodsReceiptById,
  );

  app.post(
    "/goods-receipts",
    { preHandler: [requirePermission(createPermission)] },
    createGoodsReceipt,
  );
}

module.exports = { goodsReceiptsRoutes };
