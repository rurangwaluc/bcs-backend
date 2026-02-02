const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function dayRange(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return { start, end };
}

function monthRange(monthStr) {
  // YYYY-MM
  const m = /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : null;
  if (!m) return null;
  const [y, mm] = m.split("-").map(Number);
  const start = new Date(y, mm - 1, 1, 0, 0, 0);
  const end = new Date(y, mm, 1, 0, 0, 0);
  return { start, end };
}

function weekRange(startStr) {
  const d = new Date(startStr);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 0, 0, 0);
  return { start, end };
}

async function salesAndPaymentsSummary({ locationId, start, end }) {
  const res = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int
         FROM sales
        WHERE location_id = ${locationId}
          AND created_at >= ${start}
          AND created_at < ${end}
      ) AS sales_count,

      (SELECT COALESCE(SUM(total_amount), 0)::bigint
         FROM sales
        WHERE location_id = ${locationId}
          AND created_at >= ${start}
          AND created_at < ${end}
      ) AS sales_total,

      (SELECT COUNT(*)::int
         FROM payments
        WHERE location_id = ${locationId}
          AND created_at >= ${start}
          AND created_at < ${end}
      ) AS payments_count,

      (SELECT COALESCE(SUM(amount), 0)::bigint
         FROM payments
        WHERE location_id = ${locationId}
          AND created_at >= ${start}
          AND created_at < ${end}
      ) AS payments_total
  `);

  const row = res.rows && res.rows[0] ? res.rows[0] : res[0];
  return {
    salesCount: Number(row.sales_count || 0),
    salesTotal: Number(row.sales_total || 0),
    paymentsCount: Number(row.payments_count || 0),
    paymentsTotal: Number(row.payments_total || 0),
  };
}

/**
 * Inventory snapshot (warehouse)
 */
async function inventorySnapshot({ locationId, limit = 50 }) {
  const res = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.unit,
      p.cost_price    AS "costPrice",
      p.selling_price AS "sellingPrice",
      COALESCE(b.qty_on_hand, 0)::int AS "qtyOnHand",
      (COALESCE(b.qty_on_hand, 0) * COALESCE(p.cost_price, 0))::bigint AS "stockValueCost",
      (COALESCE(b.qty_on_hand, 0) * COALESCE(p.selling_price, 0))::bigint AS "stockValueSell"
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id AND b.location_id = p.location_id
    WHERE p.location_id = ${locationId}
    ORDER BY p.id DESC
    LIMIT ${limit}
  `);

  const rows = res.rows || res;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Seller holdings snapshot
 */
async function sellerHoldingsSnapshot({ locationId, limit = 100 }) {
  const res = await db.execute(sql`
    SELECT
      sh.seller_id AS "sellerId",
      sh.product_id AS "productId",
      p.name AS "productName",
      p.sku AS "sku",
      COALESCE(sh.qty_on_hand, 0)::int AS "qtyOnHand"
    FROM seller_holdings sh
    JOIN products p
      ON p.id = sh.product_id AND p.location_id = sh.location_id
    WHERE sh.location_id = ${locationId}
    ORDER BY sh.seller_id ASC, sh.product_id ASC
    LIMIT ${limit}
  `);

  const rows = res.rows || res;
  return Array.isArray(rows) ? rows : [];
}

// --------------------------------------------------
// ✅ CASH REPORTS
// Source of truth: cash_ledger (+ sessions, refunds tables)
// --------------------------------------------------

async function cashSummary({ locationId, start, end }) {
  // Summary by direction + type + method
  const totalsRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN'  THEN amount ELSE 0 END), 0)::bigint AS in_total,
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0)::bigint AS out_total
    FROM cash_ledger
    WHERE location_id = ${locationId}
      AND created_at >= ${start}
      AND created_at < ${end}
  `);
  const trow = totalsRes.rows?.[0] || totalsRes[0] || {};
  const inTotal = Number(trow.in_total || 0);
  const outTotal = Number(trow.out_total || 0);

  const byTypeRes = await db.execute(sql`
    SELECT type, direction,
           COALESCE(SUM(amount), 0)::bigint AS total,
           COUNT(*)::int AS count
    FROM cash_ledger
    WHERE location_id = ${locationId}
      AND created_at >= ${start}
      AND created_at < ${end}
    GROUP BY type, direction
    ORDER BY type ASC, direction ASC
  `);
  const byType = (byTypeRes.rows || byTypeRes || []).map((r) => ({
    type: r.type,
    direction: r.direction,
    total: Number(r.total || 0),
    count: Number(r.count || 0),
  }));

  const byMethodRes = await db.execute(sql`
    SELECT COALESCE(method, 'CASH') as method, direction,
           COALESCE(SUM(amount), 0)::bigint AS total,
           COUNT(*)::int AS count
    FROM cash_ledger
    WHERE location_id = ${locationId}
      AND created_at >= ${start}
      AND created_at < ${end}
    GROUP BY method, direction
    ORDER BY method ASC, direction ASC
  `);
  const byMethod = (byMethodRes.rows || byMethodRes || []).map((r) => ({
    method: r.method,
    direction: r.direction,
    total: Number(r.total || 0),
    count: Number(r.count || 0),
  }));

  return {
    inTotal,
    outTotal,
    net: inTotal - outTotal,
    byType,
    byMethod,
  };
}

async function cashSessionsReport({ locationId, start, end }) {
  const sessionsRes = await db.execute(sql`
    SELECT
      id,
      location_id AS "locationId",
      cashier_id AS "cashierId",
      status,
      opened_at AS "openedAt",
      closed_at AS "closedAt",
      opening_balance AS "openingBalance",
      closing_balance AS "closingBalance",
      updated_at AS "updatedAt"
    FROM cash_sessions
    WHERE location_id = ${locationId}
      AND opened_at >= ${start}
      AND opened_at < ${end}
    ORDER BY id DESC
    LIMIT 500
  `);

  const sessions = sessionsRes.rows || sessionsRes || [];

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM cash_sessions
    WHERE location_id = ${locationId}
      AND opened_at >= ${start}
      AND opened_at < ${end}
  `);
  const crow = countRes.rows?.[0] || countRes[0] || {};
  const count = Number(crow.c || 0);

  return { count, sessions };
}

async function cashLedgerReport({ locationId, start, end, limit = 200 }) {
  const res = await db.execute(sql`
    SELECT
      id,
      location_id AS "locationId",
      cashier_id AS "cashierId",
      type,
      direction,
      amount,
      COALESCE(method, 'CASH') AS method,
      sale_id AS "saleId",
      payment_id AS "paymentId",
      note,
      created_at AS "createdAt"
    FROM cash_ledger
    WHERE location_id = ${locationId}
      AND created_at >= ${start}
      AND created_at < ${end}
    ORDER BY id DESC
    LIMIT ${limit}
  `);

  return res.rows || res || [];
}

async function cashRefundsReport({ locationId, start, end, limit = 200 }) {
  const res = await db.execute(sql`
    SELECT
      r.id,
      r.sale_id AS "saleId",
      r.amount,
      r.reason,
      r.created_by_user_id AS "createdByUserId",
      r.created_at AS "createdAt"
    FROM refunds r
    WHERE r.location_id = ${locationId}
      AND r.created_at >= ${start}
      AND r.created_at < ${end}
    ORDER BY r.id DESC
    LIMIT ${limit}
  `);

  return res.rows || res || [];
}

module.exports = {
  dayRange,
  weekRange,
  monthRange,
  salesAndPaymentsSummary,
  inventorySnapshot,
  sellerHoldingsSnapshot,

  // ✅ cash
  cashSummary,
  cashSessionsReport,
  cashLedgerReport,
  cashRefundsReport,
};
