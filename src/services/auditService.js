const { db } = require("../config/db");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { users } = require("../db/schema/users.schema");
const { and, eq, ilike, lt, gte, lte, desc } = require("drizzle-orm");
const ROLES = require("../permissions/roles");

function isOwner(user) {
  return user?.role === ROLES.OWNER;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function buildCoverageMetaFromRequest(request) {
  const user = request?.user || null;
  if (!user?.actingAsRole) return {};

  return {
    actingAsRole: user.actingAsRole || null,
    coverageReason: user.coverageReason || null,
    coverageStartedAt: user.coverageStartedAt || null,
    coverageNote: user.coverageNote || null,
  };
}

function mapAuditRow(r) {
  const meta =
    r?.meta && typeof r.meta === "object" && !Array.isArray(r.meta)
      ? r.meta
      : null;

  const coverage = meta?.actingAsRole
    ? {
        actingAsRole: meta.actingAsRole || null,
        reason: meta.coverageReason || null,
        startedAt: meta.coverageStartedAt || null,
        note: meta.coverageNote || null,
      }
    : null;

  return {
    id: r.id,
    locationId: r.locationId ?? null,
    userId: r.userId ?? null,
    userEmail: r.userEmail ?? null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? null,
    description: r.description ?? null,
    meta,
    coverage,
    createdAt: r.createdAt ?? null,
  };
}

async function logAudit({
  locationId = null,
  userId = null,
  action,
  entity,
  entityId = null,
  description = "",
  meta = null,
  request = null,
}) {
  const loc = toIntOrNull(locationId);
  const uid = toIntOrNull(userId);
  const eid = toIntOrNull(entityId);

  if (!action || !String(action).trim()) {
    const err = new Error("AUDIT: action is required");
    err.code = "AUDIT_ACTION_REQUIRED";
    throw err;
  }

  if (!entity || !String(entity).trim()) {
    const err = new Error("AUDIT: entity is required");
    err.code = "AUDIT_ENTITY_REQUIRED";
    throw err;
  }

  const baseMeta = cleanObject(meta);
  const coverageMeta = buildCoverageMetaFromRequest(request);
  const finalMeta = {
    ...baseMeta,
    ...coverageMeta,
  };

  await db.insert(auditLogs).values({
    locationId: loc,
    userId: uid,
    action: String(action),
    entity: String(entity),
    entityId: eid,
    description: String(description || ""),
    meta: Object.keys(finalMeta).length ? finalMeta : null,
  });
}

async function safeLogAudit(payload) {
  try {
    await logAudit(payload || {});
  } catch (err) {
    console.error("AUDIT_LOG_FAILED:", err?.code || err?.message || err);
  }
}

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

  if (!isOwner(adminUser)) {
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
  const nextCursor =
    mapped.length === limit ? mapped[mapped.length - 1].id : null;

  return { rows: mapped, nextCursor };
}

module.exports = { logAudit, safeLogAudit, listAuditLogs };
