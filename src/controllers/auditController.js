// backend/src/controllers/auditController.js
// Real-world audit log listing with pagination + filtering.

const auditService = require("../services/auditService");
const AUDIT_ACTIONS = require("../audit/actions");

function toInt(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function parseIsoDateStart(ymd) {
  // Expect YYYY-MM-DD. Return Date or null.
  const s = toStr(ymd);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseIsoDateEndExclusive(ymd) {
  // Exclusive end: next day at 00:00Z
  const s = toStr(ymd);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * GET /audit
 * Query:
 *  - limit (default 50, max 200)
 *  - cursor (id) for pagination: return rows with id < cursor
 *  - action, entity, entityId, userId
 *  - from, to (YYYY-MM-DD)  ✅ from inclusive, to inclusive in UI but handled as exclusive end internally
 *  - q (search in description)
 */
async function listAuditLogs(request, reply) {
  const limitRaw = toInt(request.query?.limit, 50);
  const limit = Math.max(1, Math.min(200, limitRaw || 50));

  const cursor = toInt(request.query?.cursor, null);
  const userId = toInt(request.query?.userId, null);
  const entityId = toInt(request.query?.entityId, null);

  const action = toStr(request.query?.action);
  const entity = toStr(request.query?.entity);
  const q = toStr(request.query?.q);

  const from = parseIsoDateStart(request.query?.from);
  const toExclusive = parseIsoDateEndExclusive(request.query?.to);

  const result = await auditService.listAuditLogs({
    adminUser: request.user,
    filters: {
      cursor,
      limit,
      userId,
      action: action || undefined,
      entity: entity || undefined,
      entityId,
      from,
      toExclusive,
      q: q || undefined,
    },
  });

  return reply.send({
    ok: true,
    rows: result.rows,
    nextCursor: result.nextCursor,
  });
}

/**
 * Optional helper for UI filter dropdowns.
 */
async function listAuditActions(_request, reply) {
  const actions = Object.values(AUDIT_ACTIONS);
  return reply.send({ ok: true, actions });
}

module.exports = { listAuditLogs, listAuditActions };
