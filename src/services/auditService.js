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
    locationId: r.locationId ?? r.location_id ?? null, // ✅ include for UI "Place"
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

function toIntOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

  // allow "YYYY-MM-DD" or ISO strings
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Insert one audit log row.
 * DB requires: location_id (NOT NULL), user_id (NOT NULL), entity_id (NOT NULL), description (NOT NULL)
 */
async function logAudit({
  locationId,
  userId,
  action,
  entity,
  entityId,
  description = "",
  meta = null,
}) {
  const loc = toIntOrNull(locationId);
  const uid = toIntOrNull(userId);
  const eid = toIntOrNull(entityId);

  if (loc == null) {
    const err = new Error("AUDIT: locationId is required");
    err.code = "AUDIT_LOCATION_REQUIRED";
    throw err;
  }
  if (uid == null) {
    const err = new Error("AUDIT: userId is required");
    err.code = "AUDIT_USER_REQUIRED";
    throw err;
  }
  if (!action || !entity || eid == null) {
    const err = new Error("AUDIT: action/entity/entityId are required");
    err.code = "AUDIT_FIELDS_REQUIRED";
    throw err;
  }

  // meta is jsonb in schema: keep objects as objects.
  // If caller passes a string, keep it as string.
  const metaValue = meta === undefined ? null : meta;

  await db.insert(auditLogs).values({
    locationId: loc,
    userId: uid,
    action: String(action),
    entity: String(entity),
    entityId: eid,
    description: String(description || ""), // description is NOT NULL in your schema
    meta: metaValue,
  });
}

/**
 * Non-blocking audit logging (recommended for inventory/sales/payments)
 */
async function safeLogAudit(payload) {
  try {
    await logAudit(payload || {});
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("AUDIT_LOG_FAILED:", err?.code || err?.message || err);
  }
}

/**
 * GET /audit listing
 *
 * ✅ Owner: can see all locations (whole company/system)
 * ✅ Non-owner (admin/manager/...): sees logs for their location only (store/branch wide)
 */
async function listAuditLogs({ adminUser, filters }) {
  const limit = Math.max(1, Math.min(200, Number(filters?.limit || 50)));

  const cursorId = toIntOrNull(filters?.cursor);

  const action = filters?.action ? String(filters.action) : null;
  const entity = filters?.entity ? String(filters.entity) : null;

  const entityId = toIntOrNull(filters?.entityId);
  const userId = toIntOrNull(filters?.userId);

  const from = toDateOrNull(filters?.from);
  const to = toDateOrNull(filters?.to);

  const q = filters?.q ? String(filters.q).trim() : null;

  const conds = [];

  // ✅ Scope rules
  if (!isOwner(adminUser)) {
    // Store/branch-wide audit
    conds.push(eq(auditLogs.locationId, Number(adminUser.locationId)));
  }

  if (cursorId != null) conds.push(lt(auditLogs.id, cursorId));
  if (action) conds.push(eq(auditLogs.action, action));
  if (entity) conds.push(eq(auditLogs.entity, entity));
  if (entityId != null) conds.push(eq(auditLogs.entityId, entityId));
  if (userId != null) conds.push(eq(auditLogs.userId, userId));
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
  const nextCursor = mapped.length === limit ? mapped[mapped.length - 1].id : null;

  return { rows: mapped, nextCursor };
}

module.exports = { logAudit, safeLogAudit, listAuditLogs };