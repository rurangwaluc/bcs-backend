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

function normalizeHistoryRow(row) {
  if (!row) return null;

  return {
    id: toInt(row.id, null),
    locationId: toInt(row.locationId ?? row.location_id, null),
    status: row.status ?? null,
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0) || 0,
    createdAt: row.createdAt ?? row.created_at ?? null,
    sellerId: toInt(row.sellerId ?? row.seller_id, null),

    paymentAmount: Number(row.paymentAmount ?? row.payment_amount ?? 0) || 0,
    paymentCount: toInt(row.paymentCount ?? row.payment_count, 0) || 0,
    lastPaymentAt: row.lastPaymentAt ?? row.last_payment_at ?? null,
    paymentMethod: row.paymentMethod ?? row.payment_method ?? null,

    creditId: toInt(row.creditId ?? row.credit_id, null),
    creditStatus: row.creditStatus ?? row.credit_status ?? null,
    creditAmount: Number(row.creditAmount ?? row.credit_amount ?? 0) || 0,
    creditPaidAmount:
      Number(row.creditPaidAmount ?? row.credit_paid_amount ?? 0) || 0,
    creditRemainingAmount:
      Number(row.creditRemainingAmount ?? row.credit_remaining_amount ?? 0) ||
      0,
    creditApprovedBy: toInt(
      row.creditApprovedBy ?? row.credit_approved_by,
      null,
    ),
    creditApprovedAt: row.creditApprovedAt ?? row.credit_approved_at ?? null,
    creditSettledBy: toInt(row.creditSettledBy ?? row.credit_settled_by, null),
    creditSettledAt: row.creditSettledAt ?? row.credit_settled_at ?? null,
    creditCreatedAt: row.creditCreatedAt ?? row.credit_created_at ?? null,
    creditMode: row.creditMode ?? row.credit_mode ?? null,

    refundAmount: Number(row.refundAmount ?? row.refund_amount ?? 0) || 0,
    refundCount: toInt(row.refundCount ?? row.refund_count, 0) || 0,
    lastRefundAt: row.lastRefundAt ?? row.last_refund_at ?? null,
  };
}

async function customerHistory({ locationId = null, customerId, limit = 50 }) {
  const customerIdInt = toInt(customerId, null);
  if (!customerIdInt) {
    const err = new Error("Invalid customer id");
    err.code = "BAD_CUSTOMER_ID";
    throw err;
  }

  const locationIdInt = toInt(locationId, null);
  const lim = clampLimit(limit, 50, 200);

  const result = await db.execute(sql`
    WITH payments_agg AS (
      SELECT
        p.sale_id,
        p.location_id,
        SUM(p.amount)::bigint AS payment_amount,
        COUNT(*)::int AS payment_count,
        MAX(p.created_at) AS last_payment_at,
        MAX(p.method) AS last_payment_method
      FROM payments p
      GROUP BY p.sale_id, p.location_id
    ),
    refunds_agg AS (
      SELECT
        r.sale_id,
        r.location_id,
        SUM(r.total_amount)::bigint AS refund_amount,
        COUNT(*)::int AS refund_count,
        MAX(r.created_at) AS last_refund_at
      FROM refunds r
      GROUP BY r.sale_id, r.location_id
    ),
    latest_credit AS (
      SELECT DISTINCT ON (c.sale_id, c.location_id)
        c.sale_id,
        c.location_id,
        c.id,
        c.status,
        c.principal_amount::bigint AS credit_amount,
        c.paid_amount::bigint AS credit_paid_amount,
        c.remaining_amount::bigint AS credit_remaining_amount,
        c.credit_mode AS "creditMode",
        c.approved_by AS "creditApprovedBy",
        c.approved_at AS "creditApprovedAt",
        c.settled_by AS "creditSettledBy",
        c.settled_at AS "creditSettledAt",
        c.created_at AS "creditCreatedAt"
      FROM credits c
      WHERE c.customer_id = ${customerIdInt}
      ${locationIdInt ? sql`AND c.location_id = ${locationIdInt}` : sql``}
      ORDER BY c.sale_id, c.location_id, c.id DESC
    )
    SELECT
      s.id,
      s.location_id as "locationId",
      s.status,
      s.total_amount::bigint as "totalAmount",
      s.created_at as "createdAt",
      s.seller_id as "sellerId",

      COALESCE(pa.payment_amount, 0)::bigint as "paymentAmount",
      COALESCE(pa.payment_count, 0)::int as "paymentCount",
      pa.last_payment_at as "lastPaymentAt",
      pa.last_payment_method as "paymentMethod",

      lc.id as "creditId",
      lc.status as "creditStatus",
      COALESCE(lc.credit_amount, 0)::bigint as "creditAmount",
      COALESCE(lc.credit_paid_amount, 0)::bigint as "creditPaidAmount",
      COALESCE(lc.credit_remaining_amount, 0)::bigint as "creditRemainingAmount",
      lc."creditApprovedBy",
      lc."creditApprovedAt",
      lc."creditSettledBy",
      lc."creditSettledAt",
      lc."creditCreatedAt",
      lc."creditMode",

      COALESCE(ra.refund_amount, 0)::bigint as "refundAmount",
      COALESCE(ra.refund_count, 0)::int as "refundCount",
      ra.last_refund_at as "lastRefundAt"

    FROM sales s
    LEFT JOIN payments_agg pa
      ON pa.sale_id = s.id
     AND pa.location_id = s.location_id
    LEFT JOIN latest_credit lc
      ON lc.sale_id = s.id
     AND lc.location_id = s.location_id
    LEFT JOIN refunds_agg ra
      ON ra.sale_id = s.id
     AND ra.location_id = s.location_id
    WHERE s.customer_id = ${customerIdInt}
    ${locationIdInt ? sql`AND s.location_id = ${locationIdInt}` : sql``}
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ${lim}
  `);

  const rows = rowsOf(result).map(normalizeHistoryRow).filter(Boolean);

  const totals = rows.reduce(
    (acc, row) => {
      acc.salesCount += 1;
      acc.salesTotalAmount += Number(row.totalAmount || 0);
      acc.paymentsTotalAmount += Number(row.paymentAmount || 0);
      acc.creditsTotalAmount += Number(row.creditAmount || 0);
      acc.refundsTotalAmount += Number(row.refundAmount || 0);
      return acc;
    },
    {
      salesCount: 0,
      salesTotalAmount: 0,
      paymentsTotalAmount: 0,
      creditsTotalAmount: 0,
      refundsTotalAmount: 0,
    },
  );

  return { rows, totals };
}

module.exports = {
  customerHistory,
};
