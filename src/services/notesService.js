"use strict";

const { db } = require("../config/db");
const { notes } = require("../db/schema/notes.schema");
const { and, eq, lt, desc } = require("drizzle-orm");
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

  if (!entityType) {
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
      entity: String(entityType).trim().toLowerCase(),
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
    description: `Note added to ${entityType}#${targetId}`,
    meta: {
      entityType: String(entityType).trim().toLowerCase(),
      entityId: targetId,
    },
  });

  return created;
}

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

  if (!locId) {
    const err = new Error("locationId is required");
    err.code = "BAD_LOCATION";
    throw err;
  }

  if (!entityType) {
    const err = new Error("entityType is required");
    err.code = "BAD_ENTITY_TYPE";
    throw err;
  }

  if (!targetId) {
    const err = new Error("entityId is required");
    err.code = "BAD_ENTITY_ID";
    throw err;
  }

  const baseWhere = and(
    eq(notes.locationId, locId),
    eq(notes.entity, String(entityType).trim().toLowerCase()),
    eq(notes.entityId, targetId),
  );

  const where = cursorId ? and(baseWhere, lt(notes.id, cursorId)) : baseWhere;

  const rows = await db
    .select()
    .from(notes)
    .where(where)
    .orderBy(desc(notes.id))
    .limit(lim);

  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

module.exports = { createNote, listNotes };
