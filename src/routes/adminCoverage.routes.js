const {
  getCurrentCoverage,
  startCoverageMode,
  stopCoverageMode,
} = require("../controllers/adminCoverageController");

async function adminCoverageRoutes(app) {
  app.get("/admin/coverage/current", getCurrentCoverage);
  app.post("/admin/coverage/start", startCoverageMode);
  app.post("/admin/coverage/stop", stopCoverageMode);
}

module.exports = { adminCoverageRoutes };
