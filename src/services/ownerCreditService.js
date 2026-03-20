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

function toNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
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

  if (
    [
      "PENDING",
      "PENDING_APPROVAL",
      "APPROVED",
      "PARTIALLY_PAID",
      "REJECTED",
      "SETTLED",
    ].includes(s)
  ) {
    return s;
  }

  return "";
}

function normalizeCreditMode(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();

  return s || "OPEN_BALANCE";
}

function buildCreditStatusLabel(status, creditMode) {
  const st = String(status || "")
    .trim()
    .toUpperCase();
  const mode = normalizeCreditMode(creditMode);

  if (st === "PENDING" || st === "PENDING_APPROVAL") {
    return "Pending approval";
  }

  if (st === "APPROVED") {
    return mode === "INSTALLMENT_PLAN"
      ? "Approved as installment plan"
      : "Approved as open balance";
  }

  if (st === "PARTIALLY_PAID") {
    return "Partially paid";
  }

  if (st === "SETTLED") {
    return "Settled";
  }

  if (st === "REJECTED") {
    return "Credit request rejected";
  }

  return st || "—";
}

function formatDateOnly(value) {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildRemainingBalanceLabel(remainingAmount) {
  const n = Math.max(0, Math.round(toNumber(remainingAmount, 0)));
  return `${n.toLocaleString()} RWF remaining`;
}

function buildPlanSummary({
  creditMode,
  dueDate,
  installmentCount,
  nextInstallmentDue,
}) {
  const mode = normalizeCreditMode(creditMode);

  if (mode === "INSTALLMENT_PLAN") {
    const count = toInt(installmentCount, 0);
    const nextDue = formatDateOnly(nextInstallmentDue || dueDate);

    if (count > 0 && nextDue) {
      return `${count} installment${count === 1 ? "" : "s"} • next due ${nextDue}`;
    }

    if (count > 0) {
      return `${count} installment${count === 1 ? "" : "s"}`;
    }

    if (nextDue) {
      return `Installment plan • next due ${nextDue}`;
    }

    return "Installment plan";
  }

  const due = formatDateOnly(dueDate);
  return due ? `Open balance • due ${due}` : "Open balance";
}

function decorateCreditShape(row) {
  if (!row) return null;

  const principalAmount = toNumber(
    row.principalAmount ?? row.principal_amount ?? row.amount,
    0,
  );
  const paidAmount = toNumber(row.paidAmount ?? row.paid_amount, 0);
  const remainingAmount = toNumber(
    row.remainingAmount ?? row.remaining_amount,
    Math.max(0, principalAmount - paidAmount),
  );
  const creditMode = normalizeCreditMode(row.creditMode ?? row.credit_mode);
  const status = normalizeStatus(row.status) || String(row.status || "");
  const dueDate = row.dueDate ?? row.due_date ?? null;
  const nextInstallmentDue =
    row.nextInstallmentDue ?? row.next_installment_due ?? null;
  const installmentCount = toInt(
    row.installmentCount ?? row.installment_count,
    0,
  );

  const statusLabel =
    row.statusLabel ??
    row.status_label ??
    buildCreditStatusLabel(status, creditMode);

  const planSummary =
    row.planSummary ??
    row.plan_summary ??
    buildPlanSummary({
      creditMode,
      dueDate,
      installmentCount,
      nextInstallmentDue,
    });

  const remainingBalanceLabel =
    row.remainingBalanceLabel ??
    row.remaining_balance_label ??
    buildRemainingBalanceLabel(remainingAmount);

  return {
    ...row,
    principalAmount,
    paidAmount,
    remainingAmount,
    amount: principalAmount,
    creditMode,
    status,
    statusLabel,
    planSummary,
    nextInstallmentDue,
    remainingBalanceLabel,
  };
}

function normalizeCreditRow(r) {
  if (!r) return null;

  const decorated = decorateCreditShape(r);

  return {
    id: toInt(decorated.id, null),
    location: {
      id: String(
        toInt(decorated.locationId ?? decorated.location_id, null) || "",
      ),
      name: decorated.locationName ?? decorated.location_name ?? null,
      code: decorated.locationCode ?? decorated.location_code ?? null,
      status: decorated.locationStatus ?? decorated.location_status ?? null,
    },
    saleId: toInt(decorated.saleId ?? decorated.sale_id, null),
    customerId: toInt(decorated.customerId ?? decorated.customer_id, null),
    customerName: decorated.customerName ?? decorated.customer_name ?? null,
    customerPhone: decorated.customerPhone ?? decorated.customer_phone ?? null,
    principalAmount: toNumber(decorated.principalAmount, 0),
    paidAmount: toNumber(decorated.paidAmount, 0),
    remainingAmount: toNumber(decorated.remainingAmount, 0),
    amount: toNumber(decorated.amount, 0),
    creditMode: decorated.creditMode,
    status: decorated.status ?? null,
    statusLabel: decorated.statusLabel ?? null,
    planSummary: decorated.planSummary ?? null,
    nextInstallmentDue: decorated.nextInstallmentDue ?? null,
    remainingBalanceLabel: decorated.remainingBalanceLabel ?? null,
    createdBy: toInt(
      decorated.createdBy ??
        decorated.created_by ??
        decorated.created_by_user_id ??
        decorated.createdByUserId,
      null,
    ),
    createdByName: decorated.createdByName ?? decorated.created_by_name ?? null,
    approvedBy: toInt(
      decorated.approvedBy ??
        decorated.approved_by ??
        decorated.approved_by_user_id ??
        decorated.approvedByUserId,
      null,
    ),
    approvedByName:
      decorated.approvedByName ?? decorated.approved_by_name ?? null,
    rejectedBy: toInt(
      decorated.rejectedBy ??
        decorated.rejected_by ??
        decorated.rejected_by_user_id ??
        decorated.rejectedByUserId,
      null,
    ),
    rejectedByName:
      decorated.rejectedByName ?? decorated.rejected_by_name ?? null,
    settledBy: toInt(
      decorated.settledBy ??
        decorated.settled_by ??
        decorated.settled_by_user_id ??
        decorated.settledByUserId,
      null,
    ),
    settledByName: decorated.settledByName ?? decorated.settled_by_name ?? null,
    approvedAt: decorated.approvedAt ?? decorated.approved_at ?? null,
    rejectedAt: decorated.rejectedAt ?? decorated.rejected_at ?? null,
    settledAt: decorated.settledAt ?? decorated.settled_at ?? null,
    createdAt: decorated.createdAt ?? decorated.created_at ?? null,
    dueDate: decorated.dueDate ?? decorated.due_date ?? null,
    note: decorated.note ?? null,
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
      COALESCE(SUM(c.principal_amount), 0)::bigint as "totalAmount",

      COUNT(*) FILTER (WHERE c.status IN ('PENDING', 'PENDING_APPROVAL'))::int as "pendingCount",
      COALESCE(SUM(c.principal_amount) FILTER (WHERE c.status IN ('PENDING', 'PENDING_APPROVAL')), 0)::bigint as "pendingAmount",

      COUNT(*) FILTER (WHERE c.status IN ('APPROVED', 'PARTIALLY_PAID'))::int as "approvedCount",
      COALESCE(SUM(c.remaining_amount) FILTER (WHERE c.status IN ('APPROVED', 'PARTIALLY_PAID')), 0)::bigint as "approvedAmount",

      COUNT(*) FILTER (WHERE c.status = 'REJECTED')::int as "rejectedCount",
      COALESCE(SUM(c.principal_amount) FILTER (WHERE c.status = 'REJECTED'), 0)::bigint as "rejectedAmount",

      COUNT(*) FILTER (WHERE c.status = 'SETTLED')::int as "settledCount",
      COALESCE(SUM(c.paid_amount) FILTER (WHERE c.status = 'SETTLED'), 0)::bigint as "settledAmount"
    FROM credits c
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
      ${
        normalizedStatus
          ? normalizedStatus === "PENDING_APPROVAL"
            ? sql`AND c.status IN ('PENDING', 'PENDING_APPROVAL')`
            : normalizedStatus === "PARTIALLY_PAID"
              ? sql`AND c.status = 'PARTIALLY_PAID'`
              : sql`AND c.status = ${normalizedStatus}`
          : sql``
      }
      ${
        pattern
          ? sql`AND (
              cu.name ILIKE ${pattern}
              OR cu.phone ILIKE ${pattern}
              OR CAST(c.id AS TEXT) ILIKE ${pattern}
              OR CAST(c.sale_id AS TEXT) ILIKE ${pattern}
            )`
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
      COALESCE(SUM(c.principal_amount), 0)::bigint as "totalAmount",

      COUNT(c.id) FILTER (WHERE c.status IN ('PENDING', 'PENDING_APPROVAL'))::int as "pendingCount",
      COALESCE(SUM(c.principal_amount) FILTER (WHERE c.status IN ('PENDING', 'PENDING_APPROVAL')), 0)::bigint as "pendingAmount",

      COUNT(c.id) FILTER (WHERE c.status IN ('APPROVED', 'PARTIALLY_PAID'))::int as "approvedCount",
      COALESCE(SUM(c.remaining_amount) FILTER (WHERE c.status IN ('APPROVED', 'PARTIALLY_PAID')), 0)::bigint as "approvedAmount",

      COUNT(c.id) FILTER (WHERE c.status = 'REJECTED')::int as "rejectedCount",
      COALESCE(SUM(c.principal_amount) FILTER (WHERE c.status = 'REJECTED'), 0)::bigint as "rejectedAmount",

      COUNT(c.id) FILTER (WHERE c.status = 'SETTLED')::int as "settledCount",
      COALESCE(SUM(c.paid_amount) FILTER (WHERE c.status = 'SETTLED'), 0)::bigint as "settledAmount"
    FROM locations l
    LEFT JOIN credits c
      ON c.location_id = l.id
      ${
        normalizedStatus
          ? normalizedStatus === "PENDING_APPROVAL"
            ? sql`AND c.status IN ('PENDING', 'PENDING_APPROVAL')`
            : normalizedStatus === "PARTIALLY_PAID"
              ? sql`AND c.status = 'PARTIALLY_PAID'`
              : sql`AND c.status = ${normalizedStatus}`
          : sql``
      }
      ${dateFromTs ? sql`AND c.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND c.created_at < ${dateToNextDay}` : sql``}
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
      ${
        pattern
          ? sql`AND (
              c.id IS NULL
              OR cu.name ILIKE ${pattern}
              OR cu.phone ILIKE ${pattern}
              OR CAST(c.id AS TEXT) ILIKE ${pattern}
              OR CAST(c.sale_id AS TEXT) ILIKE ${pattern}
            )`
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
    WITH installment_summary AS (
      SELECT
        ci.credit_id,
        COUNT(*)::int as "installmentCount",
        MIN(ci.due_date) FILTER (
          WHERE ci.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
        ) as "nextInstallmentDue"
      FROM credit_installments ci
      GROUP BY ci.credit_id
    )
    SELECT
      c.id,
      c.location_id as "locationId",
      c.sale_id as "saleId",
      c.customer_id as "customerId",
      c.principal_amount::bigint as "principalAmount",
      c.paid_amount::bigint as "paidAmount",
      c.remaining_amount::bigint as "remainingAmount",
      c.credit_mode as "creditMode",
      c.status,
      c.created_by as "createdBy",
      c.approved_by as "approvedBy",
      c.rejected_by as "rejectedBy",
      c.settled_by as "settledBy",
      c.approved_at as "approvedAt",
      c.rejected_at as "rejectedAt",
      c.settled_at as "settledAt",
      c.created_at as "createdAt",
      c.due_date as "dueDate",
      c.note,

      ins."installmentCount" as "installmentCount",
      ins."nextInstallmentDue" as "nextInstallmentDue",

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
    LEFT JOIN installment_summary ins
      ON ins.credit_id = c.id
    WHERE 1 = 1
      ${parsedLocationId ? sql`AND c.location_id = ${parsedLocationId}` : sql``}
      ${
        normalizedStatus
          ? normalizedStatus === "PENDING_APPROVAL"
            ? sql`AND c.status IN ('PENDING', 'PENDING_APPROVAL')`
            : normalizedStatus === "PARTIALLY_PAID"
              ? sql`AND c.status = 'PARTIALLY_PAID'`
              : sql`AND c.status = ${normalizedStatus}`
          : sql``
      }
      ${
        pattern
          ? sql`AND (
              cu.name ILIKE ${pattern}
              OR cu.phone ILIKE ${pattern}
              OR CAST(c.id AS TEXT) ILIKE ${pattern}
              OR CAST(c.sale_id AS TEXT) ILIKE ${pattern}
            )`
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
  const decorated = decorateCreditShape(detail);

  return {
    ...decorated,
    amount: toNumber(decorated.principalAmount, 0),
    location: {
      id: String(decorated.locationId || context.locationId),
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
  amount,
  method,
  note,
  reference,
  cashSessionId,
  installmentId,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const contextRes = await db.execute(sql`
    SELECT
      id,
      location_id as "locationId",
      remaining_amount as "remainingAmount"
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

  const amountToUse =
    amount != null && amount !== ""
      ? amount
      : Number(context.remainingAmount || 0) || 0;

  return creditService.settleCredit({
    locationId: context.locationId,
    cashierId: actorUserId,
    creditId: id,
    amount: amountToUse,
    method,
    note,
    reference,
    cashSessionId,
    installmentId,
  });
}

module.exports = {
  getOwnerCreditsSummary,
  listOwnerCredits,
  getOwnerCreditById,
  ownerDecideCredit,
  ownerSettleCredit,
};
