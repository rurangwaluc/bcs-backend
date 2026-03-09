"use strict";

const { db } = require("../config/db");
const { notifications } = require("../db/schema/notifications.schema");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");
const { and, eq, desc, lt, inArray, sql, isNull } = require("drizzle-orm");
const { EventEmitter } = require("events");

const userEmitters = new Map();

function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isOwner(user) {
  return (
    String(user?.role || "")
      .trim()
      .toLowerCase() === "owner"
  );
}

function getEmitter(userId) {
  const id = String(userId);
  let em = userEmitters.get(id);

  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(100);
    userEmitters.set(id, em);
  }

  return em;
}

function publishToUser(userId, payload) {
  if (userId == null) return;
  getEmitter(userId).emit("notification", payload);
}

async function getUsersByRoles({
  locationId,
  roles = [],
  onlyActive = true,
  tx = null,
}) {
  const locId = toInt(locationId, null);
  if (!locId) return [];

  const roleList = (roles || [])
    .map((r) =>
      String(r || "")
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean);

  if (!roleList.length) return [];

  const q = tx || db;

  const where = [eq(users.locationId, locId)];
  if (onlyActive) where.push(eq(users.isActive, true));
  where.push(inArray(users.role, roleList));

  const rows = await q
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      locationId: users.locationId,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(...where));

  return rows || [];
}

async function createNotification({
  locationId,
  recipientUserId,
  actorUserId = null,
  type,
  title,
  body = null,
  priority = "normal",
  entity = null,
  entityId = null,
  tx = null,
}) {
  const locId = toInt(locationId, null);
  const recId = toInt(recipientUserId, null);
  const actId = toInt(actorUserId, null);
  const entId = toInt(entityId, null);

  if (!locId) {
    const err = new Error("Invalid locationId");
    err.code = "BAD_LOCATION";
    throw err;
  }

  if (!recId) {
    const err = new Error("Invalid recipientUserId");
    err.code = "BAD_RECIPIENT";
    throw err;
  }

  if (!type || !title) {
    const err = new Error("type and title are required");
    err.code = "BAD_PAYLOAD";
    throw err;
  }

  const q = tx || db;

  const [row] = await q
    .insert(notifications)
    .values({
      locationId: locId,
      recipientUserId: recId,
      actorUserId: actId,
      type: String(type).trim(),
      title: String(title).trim(),
      body: body == null ? null : String(body),
      priority: String(priority || "normal")
        .trim()
        .toLowerCase(),
      entity: entity == null ? null : String(entity).trim(),
      entityId: entId,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    })
    .returning();

  const locRows = await q
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
    })
    .from(locations)
    .where(eq(locations.id, locId))
    .limit(1);

  const loc = locRows?.[0] || null;

  const payload = {
    ...row,
    recipientUserEmail: null,
    actorUserEmail: null,
    locationName: loc?.name || null,
    locationCode: loc?.code || null,
    locationLabel:
      loc?.name && loc?.code
        ? `${loc.name} (${loc.code})`
        : loc?.name || `Branch #${locId}`,
  };

  publishToUser(recId, payload);
  return payload;
}

async function createNotifications({
  locationId,
  recipientUserIds = [],
  actorUserId = null,
  type,
  title,
  body = null,
  priority = "normal",
  entity = null,
  entityId = null,
  tx = null,
}) {
  const unique = Array.from(
    new Set(
      (recipientUserIds || [])
        .map((x) => toInt(x, null))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );

  if (!unique.length) return [];

  const out = [];
  for (const uid of unique) {
    // eslint-disable-next-line no-await-in-loop
    const row = await createNotification({
      locationId,
      recipientUserId: uid,
      actorUserId,
      type,
      title,
      body,
      priority,
      entity,
      entityId,
      tx,
    });
    out.push(row);
  }

  return out;
}

async function notifyRoles({
  locationId,
  roles = [],
  actorUserId = null,
  type,
  title,
  body = null,
  priority = "normal",
  entity = null,
  entityId = null,
  tx = null,
}) {
  const targets = await getUsersByRoles({
    locationId,
    roles,
    onlyActive: true,
    tx,
  });

  const ids = targets.map((u) => u.id);

  return createNotifications({
    locationId,
    recipientUserIds: ids,
    actorUserId,
    type,
    title,
    body,
    priority,
    entity,
    entityId,
    tx,
  });
}

function subscribeUser(userId, handler) {
  const em = getEmitter(userId);
  em.on("notification", handler);
  return () => em.off("notification", handler);
}

/**
 * Modes:
 * - inbox   => current user only (staff-safe default)
 * - company => owner-wide feed, optionally filtered by locationId
 */
async function listNotifications({
  actorUser,
  locationId,
  recipientUserId,
  limit = 50,
  cursor = null,
  unreadOnly = false,
  scope = "inbox",
}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const cursorId = toInt(cursor, null);
  const locId = toInt(locationId, null);
  const recId = toInt(recipientUserId, null);

  const owner = isOwner(actorUser);
  const normalizedScope =
    owner && String(scope || "").toLowerCase() === "company"
      ? "company"
      : "inbox";

  const where = [];

  if (normalizedScope === "company") {
    if (locId) {
      where.push(eq(notifications.locationId, locId));
    }
  } else {
    if (!locId || !recId) {
      return { rows: [], nextCursor: null };
    }

    where.push(eq(notifications.locationId, locId));
    where.push(eq(notifications.recipientUserId, recId));
  }

  if (unreadOnly) {
    where.push(eq(notifications.isRead, false));
  }

  if (cursorId) {
    where.push(lt(notifications.id, cursorId));
  }

  const rows = await db
    .select({
      id: notifications.id,
      locationId: notifications.locationId,
      recipientUserId: notifications.recipientUserId,
      actorUserId: notifications.actorUserId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      priority: notifications.priority,
      entity: notifications.entity,
      entityId: notifications.entityId,
      isRead: notifications.isRead,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      recipientUserEmail: users.email,
      locationName: locations.name,
      locationCode: locations.code,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.recipientUserId, users.id))
    .leftJoin(locations, eq(notifications.locationId, locations.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(notifications.id))
    .limit(lim);

  const mapped = (rows || []).map((row) => ({
    ...row,
    locationLabel:
      row?.locationName && row?.locationCode
        ? `${row.locationName} (${row.locationCode})`
        : row?.locationName ||
          (row?.locationId ? `Branch #${row.locationId}` : "-"),
  }));

  const nextCursor =
    mapped.length === lim ? mapped[mapped.length - 1].id : null;

  return { rows: mapped, nextCursor };
}

async function unreadCount({ locationId, recipientUserId }) {
  const locId = toInt(locationId, null);
  const recId = toInt(recipientUserId, null);

  if (!locId || !recId) return 0;

  const res = await db.execute(sql`
    SELECT COUNT(*)::int as c
    FROM notifications
    WHERE location_id = ${locId}
      AND recipient_user_id = ${recId}
      AND is_read = false
  `);

  const rows = res.rows || res || [];
  return Number(rows?.[0]?.c || 0);
}

async function markRead({ locationId, recipientUserId, notificationId }) {
  const id = toInt(notificationId, null);
  const locId = toInt(locationId, null);
  const recId = toInt(recipientUserId, null);

  if (!id) {
    const err = new Error("Invalid notification id");
    err.code = "BAD_ID";
    throw err;
  }

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.locationId, locId),
        eq(notifications.recipientUserId, recId),
      ),
    )
    .returning();

  return updated || null;
}

async function markAllRead({ locationId, recipientUserId }) {
  const locId = toInt(locationId, null);
  const recId = toInt(recipientUserId, null);

  if (!locId || !recId) return { ok: true };

  await db.execute(sql`
    UPDATE notifications
    SET is_read = true,
        read_at = now()
    WHERE location_id = ${locId}
      AND recipient_user_id = ${recId}
      AND is_read = false
  `);

  return { ok: true };
}

module.exports = {
  createNotification,
  createNotifications,
  notifyRoles,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  getUsersByRoles,
  subscribeUser,
};
