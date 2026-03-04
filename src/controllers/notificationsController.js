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
  if (!request.user?.locationId || !request.user?.id) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const c = await notificationService.unreadCount({
    locationId: request.user.locationId,
    recipientUserId: request.user.id,
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

  const origin = request.headers.origin;

  // IMPORTANT for credentialed SSE (cookies)
  if (origin) {
    reply.raw.setHeader("Access-Control-Allow-Origin", origin);
    reply.raw.setHeader("Vary", "Origin");
    reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // SSE headers
  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");

  // Helps some proxies not buffer SSE
  reply.raw.setHeader("X-Accel-Buffering", "no");

  reply.raw.flushHeaders?.();

  const send = (event, data) => {
    try {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore write errors
    }
  };

  // initial hello + current unread count
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

  const pingTimer = setInterval(() => send("ping", { t: Date.now() }), 25000);

  const unsubscribe = require("../services/notificationService").subscribeUser(
    userId,
    (payload) => send("notification", payload),
  );

  request.raw.on("close", () => {
    clearInterval(pingTimer);
    unsubscribe();
  });

  return reply;
}

module.exports = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  stream,
};
