"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createCredit,
  approveCredit,
  recordCreditPayment,
} = require("../controllers/creditController");

async function creditRoutes(app) {
  // Seller/Admin creates credit request from a sale
  app.post(
    "/credits",
    { preHandler: [requirePermission(ACTIONS.CREDIT_CREATE)] },
    createCredit,
  );

  // Manager/Admin approves or rejects a credit
  app.patch(
    "/credits/:id/decision",
    { preHandler: [requirePermission(ACTIONS.CREDIT_DECIDE)] },
    approveCredit,
  );

  // Cashier/Admin records one credit payment (partial or final)
  app.patch(
    "/credits/:id/payment",
    { preHandler: [requirePermission(ACTIONS.CREDIT_SETTLE)] },
    recordCreditPayment,
  );

  // Legacy alias to avoid breaking old frontend calls
  app.patch(
    "/credits/:id/settle",
    { preHandler: [requirePermission(ACTIONS.CREDIT_SETTLE)] },
    recordCreditPayment,
  );
}

module.exports = { creditRoutes };
