"use strict";

const { db } = require("../config/db");
const { notes } = require("../db/schema/notes.schema");
const { users } = require("../db/schema/users.schema");
const { locations } = require("../db/schema/locations.schema");
const { and, eq, lt, desc, sql } = require("drizzle-orm");
const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function toNoteMessage(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  return s.slice(0, 2000);
}

function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function createNote({
  locationId,
  userId,
  entityType,
  entityId,
  message,
}) {
  const locId = toInt(locationId, null);
  const actorId = toInt(userId, null);
  const targetId = toInt(entityId, null);
  const clean = toNoteMessage(message);
  const type = String(entityType || "")
    .trim()
    .toLowerCase();

  if (!locId) {
    const err = new Error("locationId is required");
    err.code = "BAD_LOCATION";
    throw err;
  }

  if (!actorId) {
    const err = new Error("userId is required");
    err.code = "BAD_USER";
    throw err;
  }

  if (!type) {
    const err = new Error("entityType is required");
    err.code = "BAD_ENTITY_TYPE";
    throw err;
  }

  if (!targetId) {
    const err = new Error("entityId is required");
    err.code = "BAD_ENTITY_ID";
    throw err;
  }

  if (!clean) {
    const err = new Error("Message is required");
    err.code = "BAD_MESSAGE";
    throw err;
  }

  const now = new Date();

  const [created] = await db
    .insert(notes)
    .values({
      locationId: locId,
      userId: actorId,
      entity: type,
      entityId: targetId,
      body: clean,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await safeLogAudit({
    locationId: locId,
    userId: actorId,
    action: AUDIT.INTERNAL_NOTE_CREATED || "INTERNAL_NOTE_CREATED",
    entity: "note",
    entityId: Number(created.id),
    description: `Note added to ${type}#${targetId}`,
    meta: {
      entityType: type,
      entityId: targetId,
    },
  });

  return created;
}

/**
 * Supports:
 * - entity-specific notes (existing behavior)
 * - recent feed notes for owner/staff tab
 */
async function listNotes({
  locationId,
  entityType,
  entityId,
  limit = 50,
  cursor,
}) {
  const locId = toInt(locationId, null);
  const targetId = toInt(entityId, null);
  const lim = Math.min(200, Math.max(1, Number(limit || 50)));
  const cursorId = toInt(cursor, null);
  const cleanEntityType = entityType
    ? String(entityType).trim().toLowerCase()
    : null;

  const where = [];

  if (locId) {
    where.push(eq(notes.locationId, locId));
  }

  if (cleanEntityType) {
    where.push(eq(notes.entity, cleanEntityType));
  }

  if (targetId) {
    where.push(eq(notes.entityId, targetId));
  }

  if (cursorId) {
    where.push(lt(notes.id, cursorId));
  }

  const rows = await db
    .select({
      id: notes.id,
      locationId: notes.locationId,
      userId: notes.userId,
      entity: notes.entity,
      entityId: notes.entityId,
      body: notes.body,
      isPinned: notes.isPinned,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      userName: users.name,
      userEmail: users.email,
      locationName: locations.name,
      locationCode: locations.code,
    })
    .from(notes)
    .leftJoin(users, eq(notes.userId, users.id))
    .leftJoin(locations, eq(notes.locationId, locations.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(notes.isPinned), desc(notes.id))
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

module.exports = { createNote, listNotes };
