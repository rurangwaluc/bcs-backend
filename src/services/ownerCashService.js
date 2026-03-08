"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function clampLimit(n, def = 100, max = 500) {
  const x = toInt(n, def);
  if (!Number.isInteger(x) || x <= 0) return def;
  return Math.min(x, max);
}

function clampOffset(n) {
  const x = toInt(n, 0);
  if (!Number.isInteger(x) || x < 0) return 0;
  return x;
}

function normalizeUpper(v) {
  return String(v || "")
    .trim()
    .toUpperCase();
}

function normalizeMethod(v) {
  const m = normalizeUpper(v);
  if (["CASH", "MOMO", "BANK", "CARD", "OTHER"].includes(m)) return m;
  return "";
}

function normalizeDirection(v) {
  const d = normalizeUpper(v);
  if (["IN", "OUT"].includes(d)) return d;
  return "";
}

function normalizeType(v) {
  const t = normalizeUpper(v);
  return t || "";
}

function buildFilters({
  locationId,
  method,
  direction,
  type,
  cashierId,
  dateFrom,
  dateTo,
}) {
  const parsedLocationId = toInt(locationId, null);
  const parsedCashierId = toInt(cashierId, null);
  const normalizedMethod = normalizeMethod(method);
  const normalizedDirection = normalizeDirection(direction);
  const normalizedType = normalizeType(type);

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;
  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return {
    parsedLocationId,
    parsedCashierId,
    normalizedMethod,
    normalizedDirection,
    normalizedType,
    dateFromTs,
    dateToNextDay,
  };
}

async function getOwnerCashSummary(filters = {}) {
  const {
    parsedLocationId,
    parsedCashierId,
    normalizedMethod,
    normalizedDirection,
    normalizedType,
    dateFromTs,
    dateToNextDay,
  } = buildFilters(filters);

  const totalsRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT cl.location_id)::int as "branchesCount",
      COUNT(*)::int as "entriesCount",
      COALESCE(SUM(CASE WHEN cl.direction = 'IN' THEN cl.amount ELSE 0 END), 0)::bigint as "inTotal",
      COALESCE(SUM(CASE WHEN cl.direction = 'OUT' THEN cl.amount ELSE 0 END), 0)::bigint as "outTotal"
    FROM cash_ledger cl
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cl.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cl.cashier_id = ${parsedCashierId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(cl.method::text, '')) = ${normalizedMethod}` : sql``}
      ${normalizedDirection ? sql`AND UPPER(COALESCE(cl.direction::text, '')) = ${normalizedDirection}` : sql``}
      ${normalizedType ? sql`AND UPPER(COALESCE(cl.type::text, '')) = ${normalizedType}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
  `);

  const byLocationRes = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      COUNT(cl.id)::int as "entriesCount",
      COALESCE(SUM(CASE WHEN cl.direction = 'IN' THEN cl.amount ELSE 0 END), 0)::bigint as "inTotal",
      COALESCE(SUM(CASE WHEN cl.direction = 'OUT' THEN cl.amount ELSE 0 END), 0)::bigint as "outTotal"
    FROM locations l
    LEFT JOIN cash_ledger cl
      ON cl.location_id = l.id
      ${parsedCashierId ? sql`AND cl.cashier_id = ${parsedCashierId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(cl.method::text, '')) = ${normalizedMethod}` : sql``}
      ${normalizedDirection ? sql`AND UPPER(COALESCE(cl.direction::text, '')) = ${normalizedDirection}` : sql``}
      ${normalizedType ? sql`AND UPPER(COALESCE(cl.type::text, '')) = ${normalizedType}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  const byMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(cl.method::text, 'OTHER')) as "method",
      COALESCE(SUM(CASE WHEN cl.direction = 'IN' THEN cl.amount ELSE 0 END), 0)::bigint as "inTotal",
      COALESCE(SUM(CASE WHEN cl.direction = 'OUT' THEN cl.amount ELSE 0 END), 0)::bigint as "outTotal",
      COUNT(*)::int as "entriesCount"
    FROM cash_ledger cl
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cl.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cl.cashier_id = ${parsedCashierId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(cl.method::text, '')) = ${normalizedMethod}` : sql``}
      ${normalizedDirection ? sql`AND UPPER(COALESCE(cl.direction::text, '')) = ${normalizedDirection}` : sql``}
      ${normalizedType ? sql`AND UPPER(COALESCE(cl.type::text, '')) = ${normalizedType}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1
    ORDER BY "method" ASC
  `);

  const byTypeRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(cl.type::text, 'UNKNOWN')) as "type",
      UPPER(COALESCE(cl.direction::text, 'UNKNOWN')) as "direction",
      COALESCE(SUM(cl.amount), 0)::bigint as "total",
      COUNT(*)::int as "entriesCount"
    FROM cash_ledger cl
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cl.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cl.cashier_id = ${parsedCashierId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(cl.method::text, '')) = ${normalizedMethod}` : sql``}
      ${normalizedDirection ? sql`AND UPPER(COALESCE(cl.direction::text, '')) = ${normalizedDirection}` : sql``}
      ${normalizedType ? sql`AND UPPER(COALESCE(cl.type::text, '')) = ${normalizedType}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1, 2
    ORDER BY "type" ASC, "direction" ASC
  `);

  const totals = rowsOf(totalsRes)[0] || {
    branchesCount: 0,
    entriesCount: 0,
    inTotal: 0,
    outTotal: 0,
  };

  return {
    totals: {
      ...totals,
      net: Number(totals.inTotal || 0) - Number(totals.outTotal || 0),
    },
    byLocation: rowsOf(byLocationRes).map((r) => ({
      ...r,
      net: Number(r.inTotal || 0) - Number(r.outTotal || 0),
    })),
    byMethod: rowsOf(byMethodRes).map((r) => ({
      ...r,
      net: Number(r.inTotal || 0) - Number(r.outTotal || 0),
    })),
    byType: rowsOf(byTypeRes),
  };
}

async function listOwnerCashLedger(filters = {}) {
  const {
    parsedLocationId,
    parsedCashierId,
    normalizedMethod,
    normalizedDirection,
    normalizedType,
    dateFromTs,
    dateToNextDay,
  } = buildFilters(filters);

  const limit = clampLimit(filters.limit, 100, 500);
  const offset = clampOffset(filters.offset);

  const res = await db.execute(sql`
    SELECT
      cl.id,
      cl.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      cl.cashier_id as "cashierId",
      u.name as "cashierName",
      cl.cash_session_id as "cashSessionId",
      cl.type,
      cl.direction,
      cl.amount,
      COALESCE(cl.method, 'CASH') as "method",
      cl.reference,
      cl.sale_id as "saleId",
      cl.payment_id as "paymentId",
      cl.note,
      cl.created_at as "createdAt"
    FROM cash_ledger cl
    JOIN locations l
      ON l.id = cl.location_id
    LEFT JOIN users u
      ON u.id = cl.cashier_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cl.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cl.cashier_id = ${parsedCashierId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(cl.method::text, '')) = ${normalizedMethod}` : sql``}
      ${normalizedDirection ? sql`AND UPPER(COALESCE(cl.direction::text, '')) = ${normalizedDirection}` : sql``}
      ${normalizedType ? sql`AND UPPER(COALESCE(cl.type::text, '')) = ${normalizedType}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
    ORDER BY cl.created_at DESC, cl.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rowsOf(res);
}

async function listOwnerCashSessions(filters = {}) {
  const { parsedLocationId, parsedCashierId, dateFromTs, dateToNextDay } =
    buildFilters(filters);

  const limit = clampLimit(filters.limit, 100, 500);
  const offset = clampOffset(filters.offset);

  const res = await db.execute(sql`
    SELECT
      cs.id,
      cs.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      cs.cashier_id as "cashierId",
      u.name as "cashierName",
      cs.status,
      cs.opened_at as "openedAt",
      cs.closed_at as "closedAt",
      cs.opening_balance as "openingBalance",
      cs.closing_balance as "closingBalance",
      cs.updated_at as "updatedAt"
    FROM cash_sessions cs
    JOIN locations l
      ON l.id = cs.location_id
    LEFT JOIN users u
      ON u.id = cs.cashier_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cs.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cs.cashier_id = ${parsedCashierId}` : sql``}
      ${dateFromTs ? sql`AND cs.opened_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cs.opened_at < ${dateToNextDay}` : sql``}
    ORDER BY cs.opened_at DESC, cs.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const summaryRes = await db.execute(sql`
    SELECT
      COUNT(*)::int as "sessionsCount",
      COUNT(*) FILTER (WHERE cs.status = 'OPEN')::int as "openCount",
      COUNT(*) FILTER (WHERE cs.status = 'CLOSED')::int as "closedCount",
      COALESCE(SUM(cs.opening_balance), 0)::bigint as "openingTotal",
      COALESCE(SUM(cs.closing_balance), 0)::bigint as "closingTotal"
    FROM cash_sessions cs
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cs.location_id = ${parsedLocationId}` : sql``}
      ${parsedCashierId ? sql`AND cs.cashier_id = ${parsedCashierId}` : sql``}
      ${dateFromTs ? sql`AND cs.opened_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cs.opened_at < ${dateToNextDay}` : sql``}
  `);

  return {
    summary: rowsOf(summaryRes)[0] || {
      sessionsCount: 0,
      openCount: 0,
      closedCount: 0,
      openingTotal: 0,
      closingTotal: 0,
    },
    sessions: rowsOf(res),
  };
}

async function listOwnerCashRefunds(filters = {}) {
  const { parsedLocationId, dateFromTs, dateToNextDay } = buildFilters(filters);

  const limit = clampLimit(filters.limit, 100, 500);
  const offset = clampOffset(filters.offset);

  const res = await db.execute(sql`
    SELECT
      r.id,
      r.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      r.sale_id as "saleId",
      r.total_amount as "amount",
      r.reason,
      r.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      r.created_at as "createdAt"
    FROM refunds r
    JOIN locations l
      ON l.id = r.location_id
    LEFT JOIN users u
      ON u.id = r.created_by_user_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND r.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const summaryRes = await db.execute(sql`
    SELECT
      COUNT(*)::int as "refundsCount",
      COALESCE(SUM(r.total_amount), 0)::bigint as "refundsTotal"
    FROM refunds r
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND r.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
  `);

  return {
    summary: rowsOf(summaryRes)[0] || {
      refundsCount: 0,
      refundsTotal: 0,
    },
    refunds: rowsOf(res),
  };
}

module.exports = {
  getOwnerCashSummary,
  listOwnerCashLedger,
  listOwnerCashSessions,
  listOwnerCashRefunds,
};
