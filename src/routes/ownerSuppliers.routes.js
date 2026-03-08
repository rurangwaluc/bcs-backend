const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerSuppliersSummary,
  listOwnerSuppliers,
  getOwnerSupplier,
} = require("../controllers/ownerSuppliersController");

async function ownerSuppliersRoutes(app) {
  app.get(
    "/owner/suppliers/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerSuppliersSummary,
  );

  app.get(
    "/owner/suppliers",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerSuppliers,
  );

  app.get(
    "/owner/suppliers/:id",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerSupplier,
  );
}

module.exports = { ownerSuppliersRoutes };
