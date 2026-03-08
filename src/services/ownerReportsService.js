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

function buildFilters({ locationId, dateFrom, dateTo }) {
  const parsedLocationId = toInt(locationId, null);

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;
  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return {
    parsedLocationId,
    dateFromTs,
    dateToNextDay,
  };
}

async function getOwnerReportsOverview(filters = {}) {
  const { parsedLocationId, dateFromTs, dateToNextDay } = buildFilters(filters);

  const overviewRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT l.id)::int as "branchesCount",

      (
        SELECT COUNT(*)::int
        FROM sales s
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND s.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
      ) as "salesCount",

      (
        SELECT COALESCE(SUM(s.total_amount), 0)::bigint
        FROM sales s
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND s.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
      ) as "salesTotal",

      (
        SELECT COUNT(*)::int
        FROM payments p
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
      ) as "paymentsCount",

      (
        SELECT COALESCE(SUM(p.amount), 0)::bigint
        FROM payments p
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
      ) as "paymentsTotal",

      (
        SELECT COUNT(*)::int
        FROM credits c
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
      ) as "creditsCount",

      (
        SELECT COALESCE(SUM(c.amount), 0)::bigint
        FROM credits c
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
      ) as "creditsTotal",

      (
        SELECT COUNT(*)::int
        FROM refunds r
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND r.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
      ) as "refundsCount",

      (
        SELECT COALESCE(SUM(r.total_amount), 0)::bigint
        FROM refunds r
        WHERE 1 = 1
          ${parsedLocationId ? sql`AND r.location_id = ${parsedLocationId}` : sql``}
          ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
      ) as "refundsTotal"
    FROM locations l
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
  `);

  const row = rowsOf(overviewRes)[0] || {
    branchesCount: 0,
    salesCount: 0,
    salesTotal: 0,
    paymentsCount: 0,
    paymentsTotal: 0,
    creditsCount: 0,
    creditsTotal: 0,
    refundsCount: 0,
    refundsTotal: 0,
  };

  return {
    ...row,
    outstandingCredit:
      Number(row.creditsTotal || 0) - Number(row.paymentsTotal || 0) < 0
        ? 0
        : Number(row.creditsTotal || 0) - Number(row.paymentsTotal || 0),
  };
}

async function getOwnerBranchPerformance(filters = {}) {
  const { parsedLocationId, dateFromTs, dateToNextDay } = buildFilters(filters);

  const res = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",

      COALESCE((
        SELECT COUNT(*)::int
        FROM sales s
        WHERE s.location_id = l.id
          ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
      ), 0)::int as "salesCount",

      COALESCE((
        SELECT SUM(s.total_amount)::bigint
        FROM sales s
        WHERE s.location_id = l.id
          ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "salesTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM payments p
        WHERE p.location_id = l.id
          ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
      ), 0)::int as "paymentsCount",

      COALESCE((
        SELECT SUM(p.amount)::bigint
        FROM payments p
        WHERE p.location_id = l.id
          ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "paymentsTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM credits c
        WHERE c.location_id = l.id
          ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
      ), 0)::int as "creditsCount",

      COALESCE((
        SELECT SUM(c.amount)::bigint
        FROM credits c
        WHERE c.location_id = l.id
          ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "creditsTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM refunds r
        WHERE r.location_id = l.id
          ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
      ), 0)::int as "refundsCount",

      COALESCE((
        SELECT SUM(r.total_amount)::bigint
        FROM refunds r
        WHERE r.location_id = l.id
          ${dateFromTs ? sql`AND r.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND r.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "refundsTotal",

      COALESCE((
        SELECT SUM(CASE WHEN cl.direction = 'IN' THEN cl.amount ELSE 0 END)::bigint
        FROM cash_ledger cl
        WHERE cl.location_id = l.id
          ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "cashInTotal",

      COALESCE((
        SELECT SUM(CASE WHEN cl.direction = 'OUT' THEN cl.amount ELSE 0 END)::bigint
        FROM cash_ledger cl
        WHERE cl.location_id = l.id
          ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
          ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
      ), 0)::bigint as "cashOutTotal"
    FROM locations l
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
    ORDER BY l.name ASC
  `);

  return rowsOf(res).map((row) => ({
    ...row,
    netCash: Number(row.cashInTotal || 0) - Number(row.cashOutTotal || 0),
    paymentCoverage:
      Number(row.salesTotal || 0) > 0
        ? Math.round(
            (Number(row.paymentsTotal || 0) / Number(row.salesTotal || 0)) *
              100,
          )
        : 0,
  }));
}

async function getOwnerFinancialSummary(filters = {}) {
  const { parsedLocationId, dateFromTs, dateToNextDay } = buildFilters(filters);

  const paymentsByMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(p.method::text, 'OTHER')) as "method",
      COUNT(*)::int as "count",
      COALESCE(SUM(p.amount), 0)::bigint as "total"
    FROM payments p
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND p.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND p.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND p.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const creditsByStatusRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(c.status::text, 'UNKNOWN')) as "status",
      COUNT(*)::int as "count",
      COALESCE(SUM(c.amount), 0)::bigint as "total"
    FROM credits c
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const salesByStatusRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(s.status::text, 'UNKNOWN')) as "status",
      COUNT(*)::int as "count",
      COALESCE(SUM(s.total_amount), 0)::bigint as "total"
    FROM sales s
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND s.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const cashByMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(cl.method::text, 'OTHER')) as "method",
      UPPER(COALESCE(cl.direction::text, 'UNKNOWN')) as "direction",
      COUNT(*)::int as "count",
      COALESCE(SUM(cl.amount), 0)::bigint as "total"
    FROM cash_ledger cl
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND cl.location_id = ${parsedLocationId}` : sql``}
      ${dateFromTs ? sql`AND cl.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND cl.created_at < ${dateToNextDay}` : sql``}
    GROUP BY 1, 2
    ORDER BY "method" ASC, "direction" ASC
  `);

  return {
    paymentsByMethod: rowsOf(paymentsByMethodRes),
    creditsByStatus: rowsOf(creditsByStatusRes),
    salesByStatus: rowsOf(salesByStatusRes),
    cashByMethod: rowsOf(cashByMethodRes),
  };
}

module.exports = {
  getOwnerReportsOverview,
  getOwnerBranchPerformance,
  getOwnerFinancialSummary,
};
