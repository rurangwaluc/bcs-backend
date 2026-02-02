// backend/src/services/auditService.js
// Real-world audit logging + list APIs (filters + pagination + location scoping)

const { db } = require("../config/db");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { users } = require("../db/schema/users.schema");
const { and, eq, ilike, lt, gte, lte, desc } = require("drizzle-orm");
const ROLES = require("../permissions/roles");

function isOwner(user) {
  return user?.role === ROLES.OWNER;
}

function mapAuditRow(r) {
  return {
    id: r.id,
    locationId: r.locationId ?? r.location_id ?? null,
    userId: r.userId ?? r.user_id ?? null,
    userEmail: r.userEmail ?? r.user_email ?? null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? r.entity_id ?? null,
    description: r.description ?? null,
    meta: r.meta ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
  };
}

/**
 * Insert one audit log row.
 * This function is allowed to throw (use safeLogAudit for non-blocking).
 */
async function logAudit({
  locationId = null,
  userId = null,
  action,
  entity,
  entityId = null,
  description = "",
  meta = null,
}) {
  const metaStr =
    meta == null
      ? null
      : typeof meta === "string"
        ? meta
        : JSON.stringify(meta);

  await db.insert(auditLogs).values({
    locationId,
    userId,
    action,
    entity,
    entityId,
    description,
    meta: metaStr,
  });
}

/**
 * ✅ Non-blocking audit:
 * never throws, so it cannot break login / updates / payments etc.
 */
async function safeLogAudit(payload) {
  try {
    await logAudit(payload);
  } catch (err) {
    // do not crash main flow
    // eslint-disable-next-line no-console
    console.error("AUDIT_LOG_FAILED:", err?.message || err);
  }
}

/**
 * GET /audit listing:
 * - Owner: can see all locations
 * - Non-owner: only rows where audit_logs.location_id == adminUser.locationId
 *
 * Cursor pagination:
 * - sort id DESC
 * - if cursor, return id < cursor
 */
async function listAuditLogs({ adminUser, filters }) {
  const limit = Math.max(1, Math.min(200, Number(filters?.limit || 50)));

  const cursorId = filters?.cursor ? Number(filters.cursor) : null;
  const action = filters?.action ? String(filters.action) : null;
  const entity = filters?.entity ? String(filters.entity) : null;

  const entityId =
    filters?.entityId === undefined || filters?.entityId === null
      ? null
      : Number(filters.entityId);

  const userId =
    filters?.userId === undefined || filters?.userId === null
      ? null
      : Number(filters.userId);

  const from = filters?.from instanceof Date ? filters.from : null;
  const to = filters?.to instanceof Date ? filters.to : null;

  const q = filters?.q ? String(filters.q).trim() : null;

  const conds = [];

  // ✅ Location scoping (use audit_logs.locationId; not user join)
  if (!isOwner(adminUser)) {
    // hide global/unknown logs from non-owner
    conds.push(eq(auditLogs.locationId, adminUser.locationId));
  }

  if (cursorId) conds.push(lt(auditLogs.id, cursorId));
  if (action) conds.push(eq(auditLogs.action, action));
  if (entity) conds.push(eq(auditLogs.entity, entity));
  if (entityId !== null && Number.isFinite(entityId))
    conds.push(eq(auditLogs.entityId, entityId));
  if (userId !== null && Number.isFinite(userId))
    conds.push(eq(auditLogs.userId, userId));

  if (from) conds.push(gte(auditLogs.createdAt, from));
  if (to) conds.push(lte(auditLogs.createdAt, to));

  if (q) conds.push(ilike(auditLogs.description, `%${q}%`));

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
      locationId: auditLogs.locationId,
      userId: auditLogs.userId,
      userEmail: users.email,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      description: auditLogs.description,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where)
    .orderBy(desc(auditLogs.id))
    .limit(limit);

  const mapped = rows.map(mapAuditRow);
  const nextCursor =
    mapped.length === limit ? mapped[mapped.length - 1].id : null;

  return { rows: mapped, nextCursor };
}

module.exports = { logAudit, safeLogAudit, listAuditLogs };
