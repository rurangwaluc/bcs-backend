"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clampLimit(v, fallback = 50, max = 200) {
  const n = toInt(v, fallback);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function parseDateStart(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseDateEndExclusive(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function buildFilters({ locationId = null, from = null, to = null }) {
  return {
    locationIdInt: toInt(locationId, null),
    fromTs: parseDateStart(from),
    toExclusiveTs: parseDateEndExclusive(to),
  };
}

async function getOwnerReportsOverview({
  locationId = null,
  from = null,
  to = null,
}) {
  const { locationIdInt, fromTs, toExclusiveTs } = buildFilters({
    locationId,
    from,
    to,
  });

  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT l.id)::int as "branchesCount",

      (
        SELECT COUNT(*)::int
        FROM sales s
        WHERE 1 = 1
          ${locationIdInt ? sql`AND s.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND s.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND s.created_at < ${toExclusiveTs}` : sql``}
      ) as "salesCount",

      (
        SELECT COALESCE(SUM(s.total_amount), 0)::bigint
        FROM sales s
        WHERE 1 = 1
          ${locationIdInt ? sql`AND s.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND s.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND s.created_at < ${toExclusiveTs}` : sql``}
      ) as "salesTotal",

      (
        SELECT COUNT(*)::int
        FROM payments p
        WHERE 1 = 1
          ${locationIdInt ? sql`AND p.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND p.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND p.created_at < ${toExclusiveTs}` : sql``}
      ) as "paymentsCount",

      (
        SELECT COALESCE(SUM(p.amount), 0)::bigint
        FROM payments p
        WHERE 1 = 1
          ${locationIdInt ? sql`AND p.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND p.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND p.created_at < ${toExclusiveTs}` : sql``}
      ) as "paymentsTotal",

      (
        SELECT COUNT(*)::int
        FROM credits c
        WHERE 1 = 1
          ${locationIdInt ? sql`AND c.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
      ) as "creditsCount",

      (
        SELECT COALESCE(SUM(c.principal_amount), 0)::bigint
        FROM credits c
        WHERE 1 = 1
          ${locationIdInt ? sql`AND c.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
      ) as "creditsTotal",

      (
        SELECT COALESCE(SUM(c.remaining_amount), 0)::bigint
        FROM credits c
        WHERE 1 = 1
          ${locationIdInt ? sql`AND c.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
          AND c.status IN ('APPROVED', 'PARTIALLY_PAID')
      ) as "creditsOutstandingTotal",

      (
        SELECT COUNT(*)::int
        FROM refunds r
        WHERE 1 = 1
          ${locationIdInt ? sql`AND r.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND r.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND r.created_at < ${toExclusiveTs}` : sql``}
      ) as "refundsCount",

      (
        SELECT COALESCE(SUM(r.total_amount), 0)::bigint
        FROM refunds r
        WHERE 1 = 1
          ${locationIdInt ? sql`AND r.location_id = ${locationIdInt}` : sql``}
          ${fromTs ? sql`AND r.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND r.created_at < ${toExclusiveTs}` : sql``}
      ) as "refundsTotal"
    FROM locations l
    WHERE 1 = 1
      ${locationIdInt ? sql`AND l.id = ${locationIdInt}` : sql``}
  `);

  return (
    rowsOf(result)[0] || {
      branchesCount: 0,
      salesCount: 0,
      salesTotal: 0,
      paymentsCount: 0,
      paymentsTotal: 0,
      creditsCount: 0,
      creditsTotal: 0,
      creditsOutstandingTotal: 0,
      refundsCount: 0,
      refundsTotal: 0,
    }
  );
}

async function getOwnerBranchPerformance({ from = null, to = null }) {
  const { fromTs, toExclusiveTs } = buildFilters({ from, to });

  const result = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",

      COALESCE((
        SELECT COUNT(*)::int
        FROM sales s
        WHERE s.location_id = l.id
          ${fromTs ? sql`AND s.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND s.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::int as "salesCount",

      COALESCE((
        SELECT SUM(s.total_amount)::bigint
        FROM sales s
        WHERE s.location_id = l.id
          ${fromTs ? sql`AND s.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND s.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "salesTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM payments p
        WHERE p.location_id = l.id
          ${fromTs ? sql`AND p.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND p.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::int as "paymentsCount",

      COALESCE((
        SELECT SUM(p.amount)::bigint
        FROM payments p
        WHERE p.location_id = l.id
          ${fromTs ? sql`AND p.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND p.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "paymentsTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM credits c
        WHERE c.location_id = l.id
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::int as "creditsCount",

      COALESCE((
        SELECT SUM(c.principal_amount)::bigint
        FROM credits c
        WHERE c.location_id = l.id
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "creditsTotal",

      COALESCE((
        SELECT SUM(c.remaining_amount)::bigint
        FROM credits c
        WHERE c.location_id = l.id
          ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
          AND c.status IN ('APPROVED', 'PARTIALLY_PAID')
      ), 0)::bigint as "creditsOutstandingTotal",

      COALESCE((
        SELECT COUNT(*)::int
        FROM refunds r
        WHERE r.location_id = l.id
          ${fromTs ? sql`AND r.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND r.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::int as "refundsCount",

      COALESCE((
        SELECT SUM(r.total_amount)::bigint
        FROM refunds r
        WHERE r.location_id = l.id
          ${fromTs ? sql`AND r.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND r.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "refundsTotal",

      COALESCE((
        SELECT SUM(CASE WHEN cl.direction = 'IN' THEN cl.amount ELSE 0 END)::bigint
        FROM cash_ledger cl
        WHERE cl.location_id = l.id
          ${fromTs ? sql`AND cl.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND cl.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "cashInTotal",

      COALESCE((
        SELECT SUM(CASE WHEN cl.direction = 'OUT' THEN cl.amount ELSE 0 END)::bigint
        FROM cash_ledger cl
        WHERE cl.location_id = l.id
          ${fromTs ? sql`AND cl.created_at >= ${fromTs}` : sql``}
          ${toExclusiveTs ? sql`AND cl.created_at < ${toExclusiveTs}` : sql``}
      ), 0)::bigint as "cashOutTotal"
    FROM locations l
    WHERE 1 = 1
    ORDER BY l.name ASC
  `);

  return rowsOf(result);
}

async function getOwnerFinancialSummary({
  locationId = null,
  from = null,
  to = null,
}) {
  const { locationIdInt, fromTs, toExclusiveTs } = buildFilters({
    locationId,
    from,
    to,
  });

  const salesByStatusRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(s.status::text, 'UNKNOWN')) as "status",
      COUNT(*)::int as "count",
      COALESCE(SUM(s.total_amount), 0)::bigint as "total"
    FROM sales s
    WHERE 1 = 1
      ${locationIdInt ? sql`AND s.location_id = ${locationIdInt}` : sql``}
      ${fromTs ? sql`AND s.created_at >= ${fromTs}` : sql``}
      ${toExclusiveTs ? sql`AND s.created_at < ${toExclusiveTs}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const paymentsByMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(p.method::text, 'UNKNOWN')) as "method",
      COUNT(*)::int as "count",
      COALESCE(SUM(p.amount), 0)::bigint as "total"
    FROM payments p
    WHERE 1 = 1
      ${locationIdInt ? sql`AND p.location_id = ${locationIdInt}` : sql``}
      ${fromTs ? sql`AND p.created_at >= ${fromTs}` : sql``}
      ${toExclusiveTs ? sql`AND p.created_at < ${toExclusiveTs}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const creditsByStatusRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(c.status::text, 'UNKNOWN')) as "status",
      COUNT(*)::int as "count",
      COALESCE(SUM(c.principal_amount), 0)::bigint as "total",
      COALESCE(SUM(c.paid_amount), 0)::bigint as "paidTotal",
      COALESCE(SUM(c.remaining_amount), 0)::bigint as "remainingTotal"
    FROM credits c
    WHERE 1 = 1
      ${locationIdInt ? sql`AND c.location_id = ${locationIdInt}` : sql``}
      ${fromTs ? sql`AND c.created_at >= ${fromTs}` : sql``}
      ${toExclusiveTs ? sql`AND c.created_at < ${toExclusiveTs}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  const refundsByMethodRes = await db.execute(sql`
    SELECT
      UPPER(COALESCE(r.method::text, 'UNKNOWN')) as "method",
      COUNT(*)::int as "count",
      COALESCE(SUM(r.total_amount), 0)::bigint as "total"
    FROM refunds r
    WHERE 1 = 1
      ${locationIdInt ? sql`AND r.location_id = ${locationIdInt}` : sql``}
      ${fromTs ? sql`AND r.created_at >= ${fromTs}` : sql``}
      ${toExclusiveTs ? sql`AND r.created_at < ${toExclusiveTs}` : sql``}
    GROUP BY 1
    ORDER BY "total" DESC
  `);

  return {
    salesByStatus: rowsOf(salesByStatusRes),
    paymentsByMethod: rowsOf(paymentsByMethodRes),
    creditsByStatus: rowsOf(creditsByStatusRes),
    refundsByMethod: rowsOf(refundsByMethodRes),
  };
}

module.exports = {
  getOwnerReportsOverview,
  getOwnerBranchPerformance,
  getOwnerFinancialSummary,
};
