// backend/src/routes/bootstrap.routes.js
const { bootstrap } = require("../controllers/bootstrapController");

async function bootstrapRoutes(app) {
  // Protected by X-Bootstrap-Secret header + DB empty check
  app.post("/admin/bootstrap", bootstrap);
}

module.exports = { bootstrapRoutes };