"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createRefund,
  listRefunds,
  getRefundById,
} = require("../controllers/refundsController");

async function refundsRoutes(app) {
  app.post(
    "/refunds",
    { preHandler: [requirePermission(ACTIONS.REFUND_CREATE)] },
    createRefund,
  );

  app.get(
    "/refunds",
    { preHandler: [requirePermission(ACTIONS.REFUND_VIEW)] },
    listRefunds,
  );

  app.get(
    "/refunds/:id",
    { preHandler: [requirePermission(ACTIONS.REFUND_VIEW)] },
    getRefundById,
  );
}

module.exports = { refundsRoutes };
