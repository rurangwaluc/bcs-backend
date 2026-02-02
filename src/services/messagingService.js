const { db } = require("../config/db");
const { messages } = require("../db/schema/messages.schema");
const { eq, and, asc } = require("drizzle-orm");

async function postMessage({ locationId, entityType, entityId, user }) {
  await db.insert(messages).values({
    locationId,
    entityType,
    entityId,
    userId: user.id,
    role: user.role,
    message: user.message,
    isSystem: user.isSystem ? 1 : 0,
  });
}

async function listMessages({ locationId, entityType, entityId, limit = 200 }) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);

  // Owner may pass null locationId (multi-location oversight).
  // Non-owner calls always pass a concrete locationId.
  const where =
    locationId == null
      ? and(
          eq(messages.entityType, entityType),
          eq(messages.entityId, entityId),
        )
      : and(
          eq(messages.locationId, locationId),
          eq(messages.entityType, entityType),
          eq(messages.entityId, entityId),
        );

  const rows = await db
    .select()
    .from(messages)
    .where(where)
    .orderBy(asc(messages.createdAt))
    .limit(lim);

  return rows;
}

module.exports = { postMessage, listMessages };
