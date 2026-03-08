const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  listSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  supplierSummary,
} = require("../controllers/suppliersController");

function suppliersRoutes(app, _opts, done) {
  app.get(
    "/suppliers",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_VIEW) },
    listSuppliers,
  );

  app.get(
    "/suppliers/summary",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_REPORT_VIEW) },
    supplierSummary,
  );

  app.post(
    "/suppliers",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_CREATE) },
    createSupplier,
  );

  app.get(
    "/suppliers/:id",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_VIEW) },
    getSupplier,
  );

  app.patch(
    "/suppliers/:id",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_UPDATE) },
    updateSupplier,
  );

  app.delete(
    "/suppliers/:id",
    { preHandler: requirePermission(ACTIONS.SUPPLIER_DELETE) },
    deleteSupplier,
  );

  done();
}

module.exports = { suppliersRoutes };
