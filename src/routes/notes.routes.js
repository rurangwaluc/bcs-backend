"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const { createNote, listNotes } = require("../controllers/notesController");

async function notesRoutes(app) {
  app.get(
    "/notes",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_VIEW)] },
    listNotes,
  );

  app.post(
    "/notes",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_VIEW)] },
    createNote,
  );
}

module.exports = { notesRoutes };
