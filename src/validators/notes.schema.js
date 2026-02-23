// backend/src/validators/notes.schema.js
const { z } = require("zod");

const entityTypeEnum = z.enum(["sale", "credit", "customer"]);

const createNoteSchema = z.object({
  entityType: entityTypeEnum,
  entityId: z.number().int().positive(),
  message: z.string().trim().min(1).max(2000),
});

const listNotesSchema = z.object({
  entityType: entityTypeEnum,
  entityId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.coerce.number().int().positive().optional(),
});

module.exports = { createNoteSchema, listNotesSchema };
