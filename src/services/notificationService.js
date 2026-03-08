"use strict";

const { db } = require("../config/db");
const { notifications } = require("../db/schema/notifications.schema");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");
const { and, eq, desc, lt, inArray, sql } = require("drizzle-orm");
const { EventEmitter } = require("events");

const userEmitters = new Map();

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
  const roleList = (roles || [])
    .map((r) => String(r || "").toLowerCase())
    .filter(Boolean);

  if (!roleList.length) return [];

  const q = tx || db;

  const where = [eq(users.locationId, Number(locationId))];
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
  const locId = Number(locationId);
  const recId = Number(recipientUserId);

  if (!Number.isInteger(locId) || locId <= 0) {
    const err = new Error("Invalid locationId");
    err.code = "BAD_LOCATION";
    throw err;
  }

  if (!Number.isInteger(recId) || recId <= 0) {
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
      actorUserId: actorUserId == null ? null : Number(actorUserId),
      type: String(type),
      title: String(title),
      body: body == null ? null : String(body),
      priority: String(priority || "normal"),
      entity: entity == null ? null : String(entity),
      entityId: entityId == null ? null : Number(entityId),
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    })
    .returning();

  const locRows = await q
    .select({ name: locations.name, code: locations.code })
    .from(locations)
    .where(eq(locations.id, locId))
    .limit(1);

  const loc = locRows?.[0] || null;

  const payload = {
    ...row,
    location: {
      id: String(locId),
      name: loc?.name ?? null,
      code: loc?.code ?? null,
    },
    locationLabel:
      loc?.name && loc?.code
        ? `${loc.name} (${loc.code})`
        : loc?.name || "Store",
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
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );

  if (!unique.length) return [];

  const out = [];
  for (const uid of unique) {
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

async function listNotifications({
  locationId,
  recipientUserId,
  limit = 50,
  cursor = null,
  unreadOnly = false,
}) {
  const l = Math.max(1, Math.min(200, Number(limit) || 50));

  const where = [
    eq(notifications.locationId, Number(locationId)),
    eq(notifications.recipientUserId, Number(recipientUserId)),
  ];

  if (unreadOnly) where.push(eq(notifications.isRead, false));

  const cur = cursor == null ? null : Number(cursor);
  if (Number.isInteger(cur) && cur > 0) {
    where.push(lt(notifications.id, cur));
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(notifications.id))
    .limit(l);

  const nextCursor = rows.length === l ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

async function unreadCount({ locationId, recipientUserId }) {
  const res = await db.execute(sql`
    SELECT COUNT(*)::int as c
    FROM notifications
    WHERE location_id = ${Number(locationId)}
      AND recipient_user_id = ${Number(recipientUserId)}
      AND is_read = false
  `);

  const rows = res.rows || res || [];
  return Number(rows?.[0]?.c || 0);
}

async function markRead({ locationId, recipientUserId, notificationId }) {
  const id = Number(notificationId);

  if (!Number.isInteger(id) || id <= 0) {
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
        eq(notifications.locationId, Number(locationId)),
        eq(notifications.recipientUserId, Number(recipientUserId)),
      ),
    )
    .returning();

  return updated || null;
}

async function markAllRead({ locationId, recipientUserId }) {
  await db.execute(sql`
    UPDATE notifications
    SET is_read = true,
        read_at = now()
    WHERE location_id = ${Number(locationId)}
      AND recipient_user_id = ${Number(recipientUserId)}
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
