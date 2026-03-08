"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const creditService = require("./creditService");
const creditReadService = require("./creditReadService");

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

function normalizeStatus(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (["PENDING", "APPROVED", "REJECTED", "SETTLED"].includes(s)) {
    return s;
  }
  return "";
}

function normalizeCreditRow(r) {
  if (!r) return null;

  return {
    id: toInt(r.id, null),
    location: {
      id: String(toInt(r.locationId ?? r.location_id, null) || ""),
      name: r.locationName ?? r.location_name ?? null,
      code: r.locationCode ?? r.location_code ?? null,
      status: r.locationStatus ?? r.location_status ?? null,
    },
    saleId: toInt(r.saleId ?? r.sale_id, null),
    customerId: toInt(r.customerId ?? r.customer_id, null),
    customerName: r.customerName ?? r.customer_name ?? null,
    customerPhone: r.customerPhone ?? r.customer_phone ?? null,
    amount: Number(r.amount ?? 0) || 0,
    status: r.status ?? null,
    createdBy: toInt(
      r.createdBy ?? r.created_by ?? r.created_by_user_id ?? r.createdByUserId,
      null,
    ),
    createdByName: r.createdByName ?? r.created_by_name ?? null,
    approvedBy: toInt(
      r.approvedBy ??
        r.approved_by ??
        r.approved_by_user_id ??
        r.approvedByUserId,
      null,
    ),
    approvedByName: r.approvedByName ?? r.approved_by_name ?? null,
    rejectedBy: toInt(
      r.rejectedBy ??
        r.rejected_by ??
        r.rejected_by_user_id ??
        r.rejectedByUserId,
      null,
    ),
    rejectedByName: r.rejectedByName ?? r.rejected_by_name ?? null,
    settledBy: toInt(
      r.settledBy ?? r.settled_by ?? r.settled_by_user_id ?? r.settledByUserId,
      null,
    ),
    settledByName: r.settledByName ?? r.settled_by_name ?? null,
    approvedAt: r.approvedAt ?? r.approved_at ?? null,
    rejectedAt: r.rejectedAt ?? r.rejected_at ?? null,
    settledAt: r.settledAt ?? r.settled_at ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
    note: r.note ?? null,
  };
}

function buildFilters({ locationId, status, q, dateFrom, dateTo }) {
  const parsedLocationId = toInt(locationId, null);
  const normalizedStatus = normalizeStatus(status);
  const pattern = q ? `%${String(q).trim()}%` : null;

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;
  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return {
    parsedLocationId,
    normalizedStatus,
    pattern,
    dateFromTs,
    dateToNextDay,
  };
}

async function getOwnerCreditsSummary({
  locationId,
  status,
  q,
  dateFrom,
  dateTo,
}) {
  const {
    parsedLocationId,
    normalizedStatus,
    pattern,
    dateFromTs,
    dateToNextDay,
  } = buildFilters({ locationId, status, q, dateFrom, dateTo });

  const totalsRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT c.location_id)::int as "branchesCount",
      COUNT(*)::int as "creditsCount",
      COALESCE(SUM(c.amount), 0)::bigint as "totalAmount",

      COUNT(*) FILTER (WHERE c.status = 'PENDING')::int as "pendingCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'PENDING'), 0)::bigint as "pendingAmount",

      COUNT(*) FILTER (WHERE c.status = 'APPROVED')::int as "approvedCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'APPROVED'), 0)::bigint as "approvedAmount",

      COUNT(*) FILTER (WHERE c.status = 'REJECTED')::int as "rejectedCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'REJECTED'), 0)::bigint as "rejectedAmount",

      COUNT(*) FILTER (WHERE c.status = 'SETTLED')::int as "settledCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'SETTLED'), 0)::bigint as "settledAmount"
    FROM credits c
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
      ${normalizedStatus ? sql`AND c.status = ${normalizedStatus}` : sql``}
      ${
        pattern
          ? sql`AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern} OR CAST(c.sale_id AS TEXT) ILIKE ${pattern})`
          : sql``
      }
      ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
  `);

  const byLocationRes = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      COUNT(c.id)::int as "creditsCount",
      COALESCE(SUM(c.amount), 0)::bigint as "totalAmount",
      COUNT(*) FILTER (WHERE c.status = 'PENDING')::int as "pendingCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'PENDING'), 0)::bigint as "pendingAmount",
      COUNT(*) FILTER (WHERE c.status = 'APPROVED')::int as "approvedCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'APPROVED'), 0)::bigint as "approvedAmount",
      COUNT(*) FILTER (WHERE c.status = 'REJECTED')::int as "rejectedCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'REJECTED'), 0)::bigint as "rejectedAmount",
      COUNT(*) FILTER (WHERE c.status = 'SETTLED')::int as "settledCount",
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'SETTLED'), 0)::bigint as "settledAmount"
    FROM locations l
    LEFT JOIN credits c
      ON c.location_id = l.id
      ${normalizedStatus ? sql`AND c.status = ${normalizedStatus}` : sql``}
      ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
      ${
        pattern
          ? sql`AND (c.id IS NULL OR cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern} OR CAST(c.sale_id AS TEXT) ILIKE ${pattern})`
          : sql``
      }
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  return {
    totals: rowsOf(totalsRes)[0] || {
      branchesCount: 0,
      creditsCount: 0,
      totalAmount: 0,
      pendingCount: 0,
      pendingAmount: 0,
      approvedCount: 0,
      approvedAmount: 0,
      rejectedCount: 0,
      rejectedAmount: 0,
      settledCount: 0,
      settledAmount: 0,
    },
    byLocation: rowsOf(byLocationRes),
  };
}

async function listOwnerCredits({
  locationId,
  status,
  q,
  dateFrom,
  dateTo,
  limit = 50,
  cursor = null,
}) {
  const {
    parsedLocationId,
    normalizedStatus,
    pattern,
    dateFromTs,
    dateToNextDay,
  } = buildFilters({ locationId, status, q, dateFrom, dateTo });

  const lim = clampLimit(limit, 50, 200);
  const cur = cursor ? Number(cursor) : null;

  const res = await db.execute(sql`
    SELECT
      c.*,
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      cu.name as "customerName",
      cu.phone as "customerPhone",
      u_created.name as "createdByName",
      u_approved.name as "approvedByName",
      u_rejected.name as "rejectedByName",
      u_settled.name as "settledByName"
    FROM credits c
    JOIN locations l
      ON l.id = c.location_id
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    LEFT JOIN users u_created
      ON u_created.id = c.created_by
    LEFT JOIN users u_approved
      ON u_approved.id = c.approved_by
    LEFT JOIN users u_rejected
      ON u_rejected.id = c.rejected_by
    LEFT JOIN users u_settled
      ON u_settled.id = c.settled_by
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
      ${normalizedStatus ? sql`AND c.status = ${normalizedStatus}` : sql``}
      ${
        pattern
          ? sql`AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern} OR CAST(c.sale_id AS TEXT) ILIKE ${pattern})`
          : sql``
      }
      ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
      ${cur ? sql`AND c.id < ${cur}` : sql``}
    ORDER BY c.id DESC
    LIMIT ${lim}
  `);

  const rows = rowsOf(res).map(normalizeCreditRow).filter(Boolean);
  const nextCursor = rows.length === lim ? rows[rows.length - 1]?.id : null;

  return { rows, nextCursor };
}

async function getOwnerCreditById({ creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const contextRes = await db.execute(sql`
    SELECT id, location_id as "locationId"
    FROM credits
    WHERE id = ${id}
    LIMIT 1
  `);

  const context = rowsOf(contextRes)[0];
  if (!context) return null;

  const detail = await creditReadService.getCreditById({
    locationId: context.locationId,
    creditId: id,
  });

  if (!detail) return null;

  const metaRes = await db.execute(sql`
    SELECT
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",
      u_created.name as "createdByName",
      u_approved.name as "approvedByName",
      u_rejected.name as "rejectedByName",
      u_settled.name as "settledByName"
    FROM credits c
    JOIN locations l
      ON l.id = c.location_id
    LEFT JOIN users u_created
      ON u_created.id = c.created_by
    LEFT JOIN users u_approved
      ON u_approved.id = c.approved_by
    LEFT JOIN users u_rejected
      ON u_rejected.id = c.rejected_by
    LEFT JOIN users u_settled
      ON u_settled.id = c.settled_by
    WHERE c.id = ${id}
    LIMIT 1
  `);

  const meta = rowsOf(metaRes)[0] || {};

  return {
    ...detail,
    location: {
      id: String(detail.locationId || context.locationId),
      name: meta.locationName ?? null,
      code: meta.locationCode ?? null,
      status: meta.locationStatus ?? null,
    },
    createdByName: meta.createdByName ?? null,
    approvedByName: meta.approvedByName ?? null,
    rejectedByName: meta.rejectedByName ?? null,
    settledByName: meta.settledByName ?? null,
  };
}

async function ownerDecideCredit({ actorUserId, creditId, decision, note }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const contextRes = await db.execute(sql`
    SELECT id, location_id as "locationId"
    FROM credits
    WHERE id = ${id}
    LIMIT 1
  `);

  const context = rowsOf(contextRes)[0];
  if (!context) {
    const err = new Error("Credit not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return creditService.approveCredit({
    locationId: context.locationId,
    managerId: actorUserId,
    creditId: id,
    decision,
    note,
  });
}

async function ownerSettleCredit({
  actorUserId,
  creditId,
  method,
  note,
  cashSessionId,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const contextRes = await db.execute(sql`
    SELECT id, location_id as "locationId"
    FROM credits
    WHERE id = ${id}
    LIMIT 1
  `);

  const context = rowsOf(contextRes)[0];
  if (!context) {
    const err = new Error("Credit not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return creditService.settleCredit({
    locationId: context.locationId,
    cashierId: actorUserId,
    creditId: id,
    method,
    note,
    cashSessionId,
  });
}

module.exports = {
  getOwnerCreditsSummary,
  listOwnerCredits,
  getOwnerCreditById,
  ownerDecideCredit,
  ownerSettleCredit,
};
