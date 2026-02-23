// backend/src/services/auditService.js
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
    userId: r.userId ?? r.user_id ?? null,
    userEmail: r.userEmail ?? null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? null,
    description: r.description ?? null,
    meta: r.meta ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
  };
}

/**
 * Insert one audit log row.
 */
async function logAudit({
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
    userId,
    action,
    entity,
    entityId,
    description,
    meta: metaStr,
  });
}

/**
 * Non-blocking audit logging
 */
async function safeLogAudit(payload) {
  try {
    await logAudit(payload);
  } catch (err) {
    console.error("AUDIT_LOG_FAILED:", err?.message || err);
  }
}

/**
 * GET /audit listing
 *
 * Rules:
 * - Owner → sees all logs
 * - Non-owner → sees only own logs (by user_id)
 *
 * Cursor pagination:
 * - id DESC
 * - cursor → id < cursor
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
  const toExclusive =
    filters?.toExclusive instanceof Date ? filters.toExclusive : null;
  const q = filters?.q ? String(filters.q).trim() : null;

  const conds = [];

  // 🔐 Scope non-owners to their own audit logs
  if (!isOwner(adminUser)) {
    conds.push(eq(auditLogs.userId, adminUser.id));
  }

  if (cursorId) conds.push(lt(auditLogs.id, cursorId));
  if (action) conds.push(eq(auditLogs.action, action));
  if (entity) conds.push(eq(auditLogs.entity, entity));
  if (entityId !== null && Number.isFinite(entityId))
    conds.push(eq(auditLogs.entityId, entityId));
  if (userId !== null && Number.isFinite(userId))
    conds.push(eq(auditLogs.userId, userId));

  if (from) conds.push(gte(auditLogs.createdAt, from));
  if (toExclusive) conds.push(lt(auditLogs.createdAt, toExclusive));
  if (q) conds.push(ilike(auditLogs.description, `%${q}%`));

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
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
