const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createOwnerSupplierBill,
  updateOwnerSupplierBill,
  addOwnerSupplierBillPayment,
  voidOwnerSupplierBill,
} = require("../controllers/ownerSupplierBillsWriteController");

async function ownerSupplierBillsWriteRoutes(app) {
  app.post(
    "/owner/supplier-bills",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    createOwnerSupplierBill,
  );

  app.patch(
    "/owner/supplier-bills/:id",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    updateOwnerSupplierBill,
  );

  app.post(
    "/owner/supplier-bills/:id/payments",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    addOwnerSupplierBillPayment,
  );

  app.post(
    "/owner/supplier-bills/:id/void",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    voidOwnerSupplierBill,
  );
}

module.exports = { ownerSupplierBillsWriteRoutes };
