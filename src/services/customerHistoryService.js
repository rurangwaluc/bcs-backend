"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

async function customerHistory({ locationId, customerId, limit = 50 }) {
  const lim = clampInt(limit, 1, 200, 50);

  const locationClause =
    locationId == null ? sql`TRUE` : sql`s.location_id = ${locationId}`;

  const res = await db.execute(sql`
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
    )
    SELECT
      s.id,
      s.location_id as "locationId",
      s.status,
      s.total_amount as "totalAmount",
      s.created_at as "createdAt",
      s.seller_id as "sellerId",

      pa.payment_amount as "paymentAmount",
      pa.payment_count as "paymentCount",
      pa.last_payment_at as "lastPaymentAt",
      pa.last_payment_method as "paymentMethod",

      c.id as "creditId",
      c.status as "creditStatus",
      c.amount as "creditAmount",
      c.approved_by as "creditApprovedBy",
      c.approved_at as "creditApprovedAt",
      c.settled_by as "creditSettledBy",
      c.settled_at as "creditSettledAt",

      ra.refund_amount as "refundAmount",
      ra.refund_count as "refundCount",
      ra.last_refund_at as "lastRefundAt"

    FROM sales s
    LEFT JOIN payments_agg pa
      ON pa.sale_id = s.id AND pa.location_id = s.location_id
    LEFT JOIN credits c
      ON c.sale_id = s.id AND c.location_id = s.location_id
    LEFT JOIN refunds_agg ra
      ON ra.sale_id = s.id AND ra.location_id = s.location_id
    WHERE ${locationClause}
      AND s.customer_id = ${customerId}
    ORDER BY s.created_at DESC
    LIMIT ${lim}
  `);

  const rows = res.rows || res || [];

  let salesCount = 0;
  let salesTotal = 0;
  let paidTotal = 0;
  let creditTotal = 0;
  let refundsTotal = 0;

  for (const r of rows) {
    salesCount += 1;
    salesTotal += Number(r.totalAmount || 0);
    paidTotal += Number(r.paymentAmount || 0);
    creditTotal += Number(r.creditAmount || 0);
    refundsTotal += Number(r.refundAmount || 0);
  }

  return {
    rows,
    totals: {
      salesCount,
      salesTotalAmount: salesTotal,
      paymentsTotalAmount: paidTotal,
      creditsTotalAmount: creditTotal,
      refundsTotalAmount: refundsTotal,
    },
  };
}

module.exports = { customerHistory };
