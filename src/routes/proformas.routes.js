"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createProforma,
  listProformas,
  getProformaById,
  renderProforma,
} = require("../controllers/proformasController");

async function proformasRoutes(app) {
  const viewPermission =
    ACTIONS.PROFORMA_VIEW || ACTIONS.SALE_VIEW || ACTIONS.REPORT_VIEW;

  const createPermission = ACTIONS.PROFORMA_CREATE || ACTIONS.SALE_CREATE;

  app.get(
    "/proformas",
    { preHandler: [requirePermission(viewPermission)] },
    listProformas,
  );

  app.get(
    "/proformas/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getProformaById,
  );

  app.get(
    "/proformas/:id/print",
    { preHandler: [requirePermission(viewPermission)] },
    renderProforma,
  );

  app.post(
    "/proformas",
    { preHandler: [requirePermission(createPermission)] },
    createProforma,
  );
}

module.exports = { proformasRoutes };
