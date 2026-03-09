"use strict";

const ACTIONS = require("../permissions/actions");
const { requirePermission } = require("../middleware/requirePermission");

const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  stream,
} = require("../controllers/notificationsController");

async function notificationsRoutes(app) {
  app.get(
    "/notifications",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_VIEW)] },
    listNotifications,
  );

  app.get(
    "/notifications/unread-count",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_VIEW)] },
    unreadCount,
  );

  app.patch(
    "/notifications/:id/read",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_MARK_READ)] },
    markRead,
  );

  app.patch(
    "/notifications/read-all",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_MARK_READ)] },
    markAllRead,
  );

  app.get(
    "/notifications/stream",
    { preHandler: [requirePermission(ACTIONS.NOTIFICATION_VIEW)] },
    stream,
  );
}

module.exports = { notificationsRoutes };
