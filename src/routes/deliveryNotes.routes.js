"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  createDeliveryNote,
  listDeliveryNotes,
  getDeliveryNoteById,
  renderDeliveryNote,
} = require("../controllers/deliveryNotesController");

async function deliveryNotesRoutes(app) {
  const viewPermission =
    ACTIONS.DELIVERY_NOTE_VIEW || ACTIONS.SALE_VIEW || ACTIONS.REPORT_VIEW;

  const createPermission =
    ACTIONS.DELIVERY_NOTE_CREATE || ACTIONS.SALE_UPDATE || ACTIONS.SALE_VIEW;

  app.get(
    "/delivery-notes",
    { preHandler: [requirePermission(viewPermission)] },
    listDeliveryNotes,
  );

  app.get(
    "/delivery-notes/:id",
    { preHandler: [requirePermission(viewPermission)] },
    getDeliveryNoteById,
  );

  app.get(
    "/delivery-notes/:id/print",
    { preHandler: [requirePermission(viewPermission)] },
    renderDeliveryNote,
  );

  app.post(
    "/delivery-notes",
    { preHandler: [requirePermission(createPermission)] },
    createDeliveryNote,
  );
}

module.exports = { deliveryNotesRoutes };
