const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  listOwnerSupplierBills,
  ownerSupplierBillsSummary,
  getOwnerSupplierBill,
} = require("../controllers/ownerSupplierBillsController");

async function ownerSupplierBillsRoutes(app) {
  app.get(
    "/owner/supplier-bills",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    listOwnerSupplierBills,
  );

  app.get(
    "/owner/supplier-bills/summary",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    ownerSupplierBillsSummary,
  );

  app.get(
    "/owner/supplier-bills/:id",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    getOwnerSupplierBill,
  );
}

module.exports = { ownerSupplierBillsRoutes };
