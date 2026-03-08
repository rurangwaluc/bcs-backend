const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  getOwnerCreditsSummary,
  listOwnerCredits,
  getOwnerCredit,
  ownerDecideCredit,
  ownerSettleCredit,
} = require("../controllers/ownerCreditController");

async function ownerCreditRoutes(app) {
  app.get(
    "/owner/credits/summary",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerCreditsSummary,
  );

  app.get(
    "/owner/credits",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    listOwnerCredits,
  );

  app.get(
    "/owner/credits/:id",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    getOwnerCredit,
  );

  app.patch(
    "/owner/credits/:id/decision",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    ownerDecideCredit,
  );

  app.patch(
    "/owner/credits/:id/settle",
    {
      preHandler: [requirePermission(ACTIONS.OWNER_ONLY)],
    },
    ownerSettleCredit,
  );
}

module.exports = { ownerCreditRoutes };
