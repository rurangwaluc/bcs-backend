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

function clampLimit(n, def = 50, max = 200) {
  const x = toInt(n, def);
  if (!Number.isInteger(x) || x <= 0) return def;
  return Math.min(x, max);
}

function clampOffset(n) {
  const x = toInt(n, 0);
  if (!Number.isInteger(x) || x < 0) return 0;
  return x;
}

function normalizeMethod(v) {
  const m = String(v || "")
    .trim()
    .toUpperCase();
  if (["CASH", "MOMO", "BANK", "CARD", "OTHER"].includes(m)) return m;
  return "";
}

function normalizePaymentRow(r) {
  if (!r) return null;

  return {
    id: toInt(r.id, null),
    saleId: toInt(r.saleId ?? r.sale_id, null),
    location: {
      id: String(toInt(r.locationId ?? r.location_id, null) || ""),
      name: r.locationName ?? r.location_name ?? null,
      code: r.locationCode ?? r.location_code ?? null,
    },
    cashierId: toInt(r.cashierId ?? r.cashier_id, null),
    cashierName: r.cashierName ?? r.cashier_name ?? null,
    customerName: r.customerName ?? r.customer_name ?? null,
    customerPhone: r.customerPhone ?? r.customer_phone ?? null,
    amount: Number(r.amount ?? 0) || 0,
    method: r.method ?? null,
    note: r.note ?? null,
    cashSessionId: toInt(r.cashSessionId ?? r.cash_session_id, null),
    createdAt: r.createdAt ?? r.created_at ?? null,
  };
}

function buildFilterSql({ locationId, method, dateFrom, dateTo }) {
  const parsedLocationId = toInt(locationId, null);
  const normalizedMethod = normalizeMethod(method);

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;
  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return {
    parsedLocationId,
    normalizedMethod,
    dateFromTs,
    dateToNextDay,
  };
}

async function listOwnerPayments({
  locationId,
  method,
  dateFrom,
  dateTo,
  limit = 50,
  offset = 0,
}) {
  const { parsedLocationId, normalizedMethod, dateFromTs, dateToNextDay } =
    buildFilterSql({ locationId, method, dateFrom, dateTo });

  const lim = clampLimit(limit, 50, 200);
  const off = clampOffset(offset);

  const res = await db.execute(sql`
    SELECT
      p.id,
      p.sale_id as "saleId",
      p.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      p.cashier_id as "cashierId",
      u.name as "cashierName",
      p.cash_session_id as "cashSessionId",
      p.amount,
      p.method,
      p.note,
      p.created_at as "createdAt",
      COALESCE(c.name, s.customer_name) as "customerName",
      COALESCE(c.phone, s.customer_phone) as "customerPhone"
    FROM payments p
    JOIN locations l
      ON l.id = p.location_id
    LEFT JOIN users u
      ON u.id = p.cashier_id
    LEFT JOIN sales s
      ON s.id = p.sale_id
     AND s.location_id = p.location_id
    LEFT JOIN customers c
      ON c.id = s.customer_id
     AND c.location_id = s.location_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(p.method::text, '')) = ${normalizedMethod}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${lim}
    OFFSET ${off}
  `);

  return rowsOf(res).map(normalizePaymentRow).filter(Boolean);
}

async function getOwnerPaymentsSummary({
  locationId,
  method,
  dateFrom,
  dateTo,
}) {
  const { parsedLocationId, normalizedMethod, dateFromTs, dateToNextDay } =
    buildFilterSql({ locationId, method, dateFrom, dateTo });

  const totalsRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT p.location_id)::int as "branchesCount",
      COUNT(*)::int as "paymentsCount",
      COALESCE(SUM(p.amount), 0)::bigint as "totalAmount"
    FROM payments p
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(p.method::text, '')) = ${normalizedMethod}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
  `);

  const byLocationRes = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      COUNT(p.id)::int as "paymentsCount",
      COALESCE(SUM(p.amount), 0)::bigint as "totalAmount"
    FROM locations l
    LEFT JOIN payments p
      ON p.location_id = l.id
      ${normalizedMethod ? sql`AND UPPER(COALESCE(p.method::text, '')) = ${normalizedMethod}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  const totalsRows = rowsOf(totalsRes);
  const byLocationRows = rowsOf(byLocationRes);

  return {
    totals: totalsRows[0] || {
      branchesCount: 0,
      paymentsCount: 0,
      totalAmount: 0,
    },
    byLocation: byLocationRows,
  };
}

async function getOwnerPaymentsBreakdown({
  locationId,
  method,
  dateFrom,
  dateTo,
}) {
  const { parsedLocationId, normalizedMethod, dateFromTs, dateToNextDay } =
    buildFilterSql({ locationId, method, dateFrom, dateTo });

  const byMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(p.method::text, 'OTHER')) as "method",
      COUNT(*)::int as "count",
      COALESCE(SUM(p.amount), 0)::bigint as "total"
    FROM payments p
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
      ${normalizedMethod ? sql`AND UPPER(COALESCE(p.method::text, '')) = ${normalizedMethod}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC, "method" ASC
  `);

  const byLocationMethodRes = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      UPPER(COALESCE(p.method::text, 'OTHER')) as "method",
      COUNT(p.id)::int as "count",
      COALESCE(SUM(p.amount), 0)::bigint as "total"
    FROM locations l
    LEFT JOIN payments p
      ON p.location_id = l.id
      ${normalizedMethod ? sql`AND UPPER(COALESCE(p.method::text, '')) = ${normalizedMethod}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
    GROUP BY l.id, l.name, l.code, 4
    ORDER BY l.name ASC, "total" DESC
  `);

  const byMethod = rowsOf(byMethodRes).map((r) => ({
    method: r?.method ?? "OTHER",
    count: Number(r?.count ?? 0),
    total: Number(r?.total ?? 0),
  }));

  const byLocationMethod = rowsOf(byLocationMethodRes).map((r) => ({
    locationId: Number(r?.locationId ?? 0),
    locationName: r?.locationName ?? null,
    locationCode: r?.locationCode ?? null,
    method: r?.method ?? "OTHER",
    count: Number(r?.count ?? 0),
    total: Number(r?.total ?? 0),
  }));

  return {
    byMethod,
    byLocationMethod,
  };
}

module.exports = {
  listOwnerPayments,
  getOwnerPaymentsSummary,
  getOwnerPaymentsBreakdown,
};
