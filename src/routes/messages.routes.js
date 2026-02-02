const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");
const {
  createMessage,
  getMessages,
} = require("../controllers/messagesController");

async function messagesRoutes(app) {
  // Post a message (comment thread)
  app.post(
    "/messages",
    { preHandler: [requirePermission(ACTIONS.MESSAGE_CREATE)] },
    createMessage,
  );

  // Read message thread
  app.get(
    "/messages/:entityType/:entityId",
    { preHandler: [requirePermission(ACTIONS.MESSAGE_VIEW)] },
    getMessages,
  );
}

module.exports = { messagesRoutes };
