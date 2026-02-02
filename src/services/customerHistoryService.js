const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(Math.max(Math.trunc(x), min), max);
}

async function customerHistory({ locationId, customerId, limit = 50 }) {
  const lim = clampInt(limit, 1, 200, 50);

  // Location filter:
  // - locationId is a number => restrict
  // - locationId is null/undefined => owner/global (all locations)
  const locationClause =
    locationId == null ? sql`TRUE` : sql`s.location_id = ${locationId}`;

  const res = await db.execute(sql`
    WITH refunds_agg AS (
      SELECT
        sale_id,
        location_id,
        SUM(amount)::int AS refund_amount,
        COUNT(*)::int AS refund_count,
        MAX(created_at) AS last_refund_at
      FROM refunds
      GROUP BY sale_id, location_id
    )
    SELECT
      s.id,
      s.status,
      s.total_amount AS "totalAmount",
      s.created_at AS "createdAt",
      s.seller_id AS "sellerId",

      -- payment (1 per sale in your schema)
      p.id AS "paymentId",
      p.amount AS "paymentAmount",
      p.method AS "paymentMethod",
      p.created_at AS "paymentCreatedAt",
      p.cashier_id AS "cashierId",

      -- credit (typically 1 per sale)
      c.id AS "creditId",
      c.status AS "creditStatus",
      c.amount AS "creditAmount",
      c.approved_by AS "creditApprovedBy",
      c.approved_at AS "creditApprovedAt",
      c.settled_by AS "creditSettledBy",
      c.settled_at AS "creditSettledAt",

      -- refunds aggregate
      ra.refund_amount AS "refundAmount",
      ra.refund_count AS "refundCount",
      ra.last_refund_at AS "lastRefundAt"

    FROM sales s
    LEFT JOIN payments p
      ON p.sale_id = s.id AND p.location_id = s.location_id
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

  // Simple totals for owner dashboards / customer profile cards
  let salesCount = 0;
  let salesTotal = 0;
  let paidTotal = 0;
  let creditTotal = 0;
  let refundsTotal = 0;

  for (const r of rows) {
    salesCount += 1;
    salesTotal += Number(r.totalAmount || 0);
    paidTotal += Number(r.paymentAmount || 0);
    // creditAmount exists when credit record exists
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
