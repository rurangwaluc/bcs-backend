const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  listSupplierBills,
  getSupplierBill,
  createSupplierBill,
  updateSupplierBill,
  deleteSupplierBill,
  createSupplierBillPayment,
  supplierSummary,
} = require("../controllers/supplierBillsController");

function supplierBillsRoutes(app, _opts, done) {
  app.get(
    "/supplier-bills",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_VIEW)] },
    listSupplierBills,
  );

  app.post(
    "/supplier-bills",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_CREATE)] },
    createSupplierBill,
  );

  app.get(
    "/supplier-bills/:id",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_VIEW)] },
    getSupplierBill,
  );

  app.patch(
    "/supplier-bills/:id",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_UPDATE)] },
    updateSupplierBill,
  );

  app.delete(
    "/supplier-bills/:id",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_DELETE)] },
    deleteSupplierBill,
  );

  app.post(
    "/supplier-bills/:id/payments",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_BILL_PAYMENT_CREATE)] },
    createSupplierBillPayment,
  );

  app.get(
    "/supplier/summary",
    { preHandler: [requirePermission(ACTIONS.SUPPLIER_REPORT_VIEW)] },
    supplierSummary,
  );

  done();
}

module.exports = { supplierBillsRoutes };
