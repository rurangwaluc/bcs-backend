// backend/src/validators/audit.schema.js
const { z } = require("zod");

/**
 * Audit logs should be read-only from UI.
 * So we validate query params for listing/searching.
 *
 * Notes:
 * - action/entity are strings, optional filters
 * - from/to are YYYY-MM-DD or ISO timestamps (we accept string and parse later)
 * - cursor pagination uses "cursor" (audit id) and returns rows with id < cursor
 * - limit max 200
 */
const auditListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),

  action: z.string().trim().min(1).optional(),
  entity: z.string().trim().min(1).optional(),

  userId: z.coerce.number().int().positive().optional(),
  entityId: z.coerce.number().int().positive().optional(),

  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),

  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = { auditListQuerySchema };
