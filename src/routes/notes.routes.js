const { createNote, listNotes } = require("../controllers/notesController");

async function notesRoutes(app) {
  // ✅ Global auth already exists in app.js:
  // app.addHook("preHandler", sessionAuth)
  // So DO NOT add sessionAuth here.
  app.get("/notes", listNotes);
  app.post("/notes", createNote);
}

module.exports = { notesRoutes };
