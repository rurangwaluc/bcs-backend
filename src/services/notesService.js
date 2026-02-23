// backend/src/services/notesService.js
const { db } = require("../config/db");
const { internalNotes } = require("../db/schema/internal_notes.schema");
const { and, eq, lt, desc } = require("drizzle-orm");
const { safeLogAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function toNoteMessage(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  return s.slice(0, 2000);
}

async function createNote({
  locationId,
  userId,
  entityType,
  entityId,
  message,
}) {
  const clean = toNoteMessage(message);
  if (!clean) {
    const err = new Error("Message is required");
    err.code = "BAD_MESSAGE";
    throw err;
  }

  const [created] = await db
    .insert(internalNotes)
    .values({
      locationId,
      entityType,
      entityId,
      message: clean,
      createdBy: userId,
    })
    .returning();

  // ✅ Non-blocking audit (cannot break your request)
  await safeLogAudit({
    locationId,
    userId,
    action: AUDIT.INTERNAL_NOTE_CREATED || "INTERNAL_NOTE_CREATED",
    entity: "internal_note",
    entityId: created.id,
    description: `Note added to ${entityType}#${entityId}`,
    meta: { entityType, entityId },
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
  const lim = Math.min(200, Math.max(1, Number(limit || 50)));

  const whereBase = and(
    eq(internalNotes.locationId, locationId),
    eq(internalNotes.entityType, entityType),
    eq(internalNotes.entityId, entityId),
  );

  const where = cursor
    ? and(whereBase, lt(internalNotes.id, Number(cursor)))
    : whereBase;

  const rows = await db
    .select()
    .from(internalNotes)
    .where(where)
    .orderBy(desc(internalNotes.id))
    .limit(lim);

  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return { rows, nextCursor };
}

module.exports = { createNote, listNotes };
