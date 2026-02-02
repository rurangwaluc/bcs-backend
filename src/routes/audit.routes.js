// backend/src/routes/audit.routes.js

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  listAuditLogs,
  listAuditActions,
} = require("../controllers/auditController");

async function auditRoutes(app) {
  // Read audit logs (JSON)
  app.get(
    "/audit",
    { preHandler: [requirePermission(ACTIONS.AUDIT_VIEW)] },
    listAuditLogs,
  );

  // Provide action list for UI filters
  app.get(
    "/audit/actions",
    { preHandler: [requirePermission(ACTIONS.AUDIT_VIEW)] },
    listAuditActions,
  );
}

module.exports = { auditRoutes };
