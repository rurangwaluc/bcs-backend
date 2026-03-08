"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createOwnerSupplier,
  updateOwnerSupplier,
  deactivateOwnerSupplier,
  reactivateOwnerSupplier,
} = require("../controllers/ownerSuppliersWriteController");

async function ownerSuppliersWriteRoutes(app) {
  app.post(
    "/owner/suppliers",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    createOwnerSupplier,
  );

  app.patch(
    "/owner/suppliers/:id",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    updateOwnerSupplier,
  );

  app.post(
    "/owner/suppliers/:id/deactivate",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    deactivateOwnerSupplier,
  );

  app.post(
    "/owner/suppliers/:id/reactivate",
    { preHandler: [requirePermission(ACTIONS.OWNER_ONLY)] },
    reactivateOwnerSupplier,
  );
}

module.exports = { ownerSuppliersWriteRoutes };
