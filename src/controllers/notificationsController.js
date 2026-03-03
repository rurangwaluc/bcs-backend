// backend/src/controllers/notificationsController.js
"use strict";

const notificationService = require("../services/notificationService");

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

async function listNotifications(request, reply) {
  const locationId = request.user?.locationId;
  const userId = request.user?.id;

  const limit = toInt(request.query?.limit, 50);
  const cursor = request.query?.cursor
    ? toInt(request.query.cursor, null)
    : null;
  const unreadOnly =
    String(request.query?.unreadOnly || "").toLowerCase() === "true";

  const data = await notificationService.listNotifications({
    locationId,
    recipientUserId: userId,
    limit,
    cursor,
    unreadOnly,
  });

  return reply.send({ ok: true, ...data });
}

async function unreadCount(request, reply) {
  const locationId = request.user?.locationId;
  const userId = request.user?.id;

  const c = await notificationService.unreadCount({
    locationId,
    recipientUserId: userId,
  });
  return reply.send({ ok: true, unread: c });
}

async function markRead(request, reply) {
  const locationId = request.user?.locationId;
  const userId = request.user?.id;

  const id = toInt(request.params?.id, 0);
  if (!id) return reply.status(400).send({ error: "Invalid notification id" });

  const updated = await notificationService.markRead({
    locationId,
    recipientUserId: userId,
    notificationId: id,
  });

  return reply.send({ ok: true, notification: updated });
}

async function markAllRead(request, reply) {
  const locationId = request.user?.locationId;
  const userId = request.user?.id;

  const res = await notificationService.markAllRead({
    locationId,
    recipientUserId: userId,
  });
  return reply.send({ ok: true, ...res });
}

/**
 * SSE stream endpoint:
 * GET /notifications/stream
 *
 * Client receives events like:
 * event: notification
 * data: {...json...}
 */
async function stream(request, reply) {
  const userId = request.user?.id;
  const locationId = request.user?.locationId;

  // SSE headers
  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders?.();

  const send = (event, data) => {
    try {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore write errors
    }
  };

  // initial hello + current unread count (helps UI show badge instantly)
  try {
    const unread = await require("../services/notificationService").unreadCount(
      {
        locationId,
        recipientUserId: userId,
      },
    );
    send("hello", { ok: true, unread });
  } catch {
    send("hello", { ok: true, unread: 0 });
  }

  // keepalive ping every 25s (prevents proxies from closing connection)
  const pingTimer = setInterval(() => send("ping", { t: Date.now() }), 25000);

  const unsubscribe = require("../services/notificationService").subscribeUser(
    userId,
    (payload) => {
      send("notification", payload);
    },
  );

  request.raw.on("close", () => {
    clearInterval(pingTimer);
    unsubscribe();
  });

  // Keep open
  return reply;
}

module.exports = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  stream,
};
