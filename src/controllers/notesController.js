"use strict";

const {
  createNoteSchema,
  listNotesSchema,
} = require("../validators/notes.schema");
const notesService = require("../services/notesService");

function requireUser(request, reply) {
  if (!request.user) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function isOwner(user) {
  return (
    String(user?.role || "")
      .trim()
      .toLowerCase() === "owner"
  );
}

async function createNote(request, reply) {
  if (!requireUser(request, reply)) return;

  const parsed = createNoteSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const note = await notesService.createNote({
      locationId: request.user.locationId,
      userId: request.user.id,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      message: parsed.data.message,
    });

    return reply.send({ ok: true, note });
  } catch (e) {
    request.log.error({ err: e }, "createNote failed");
    if (
      e.code === "BAD_MESSAGE" ||
      e.code === "BAD_LOCATION" ||
      e.code === "BAD_USER" ||
      e.code === "BAD_ENTITY_TYPE" ||
      e.code === "BAD_ENTITY_ID"
    ) {
      return reply.status(400).send({ error: e.message });
    }
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

async function listNotes(request, reply) {
  if (!requireUser(request, reply)) return;

  const parsed = listNotesSchema.safeParse(request.query || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: "Invalid query", details: parsed.error.flatten() });
  }

  try {
    const owner = isOwner(request.user);

    const effectiveLocationId = owner
      ? (parsed.data.locationId ?? null)
      : request.user.locationId;

    const out = await notesService.listNotes({
      locationId: effectiveLocationId,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });

    return reply.send({ ok: true, rows: out.rows, nextCursor: out.nextCursor });
  } catch (e) {
    request.log.error({ err: e }, "listNotes failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  }
}

module.exports = { createNote, listNotes };
