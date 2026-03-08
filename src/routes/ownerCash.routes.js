const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerCashSummary,
  listOwnerCashLedger,
  listOwnerCashSessions,
  listOwnerCashRefunds,
} = require("../controllers/ownerCashController");

async function ownerCashRoutes(app) {
  app.get(
    "/owner/cash/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerCashSummary,
  );

  app.get(
    "/owner/cash/ledger",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerCashLedger,
  );

  app.get(
    "/owner/cash/sessions",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerCashSessions,
  );

  app.get(
    "/owner/cash/refunds",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerCashRefunds,
  );
}

module.exports = { ownerCashRoutes };
