// backend/src/routes/credit.read.routes.js

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  getCredit,
  listCredits,
  listOpenCredits,
} = require("../controllers/creditReadController");

async function creditReadRoutes(app) {
  app.get(
    "/credits",
    { preHandler: [requirePermission(ACTIONS.CREDIT_VIEW)] },
    listCredits,
  );

  app.get(
    "/credits/open",
    { preHandler: [requirePermission(ACTIONS.CREDIT_VIEW)] },
    listOpenCredits,
  );

  app.get(
    "/credits/:id",
    { preHandler: [requirePermission(ACTIONS.CREDIT_VIEW)] },
    getCredit,
  );
}

module.exports = { creditReadRoutes };
