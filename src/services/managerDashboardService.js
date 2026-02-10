// backend/src/services/managerDashboardService.js
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(r) {
  return r?.rows || r || [];
}

/**
 * Manager dashboard summary for ONE location.
 * Tables used here match what you showed exists in public schema:
 * - sales
 * - payments
 * - inventory_balances
 */
async function getManagerDashboard({ locationId }) {
  // DB-based day start is consistent (server time / DB time)
  const todayStart = sql`date_trunc('day', now())`;
  const yesterdayStart = sql`date_trunc('day', now()) - interval '1 day'`;

  // -----------------------------
  // 1) Sales KPIs
  // -----------------------------
  const salesToday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(total_amount),0)::int as total
        from sales
        where location_id = ${locationId}
          and created_at >= ${todayStart}
      `),
  )[0] || { count: 0, total: 0 };

  const awaitingPayment = rowsOf(
    await db.execute(sql`
        select count(*)::int as count
        from sales
        where location_id = ${locationId}
          and status = 'AWAITING_PAYMENT_RECORD'
      `),
  )[0] || { count: 0 };

  const draftSales = rowsOf(
    await db.execute(sql`
        select count(*)::int as count
        from sales
        where location_id = ${locationId}
          and status = 'DRAFT'
      `),
  )[0] || { count: 0 };

  const completedToday = rowsOf(
    await db.execute(sql`
        select count(*)::int as count
        from sales
        where location_id = ${locationId}
          and status = 'COMPLETED'
          and created_at >= ${todayStart}
      `),
  )[0] || { count: 0 };

  // -----------------------------
  // 1b) Stuck sales widget
  // Rule: NOT COMPLETED and older than 30 minutes
  // -----------------------------
  const stuckRule = "NOT COMPLETED and older than 30 minutes";

  const stuckSales = rowsOf(
    await db.execute(sql`
      select
        id,
        status,
        total_amount as "totalAmount",
        created_at as "createdAt",
        extract(epoch from (now() - created_at))::int as "ageSeconds"
      from sales
      where location_id = ${locationId}
        and status <> 'COMPLETED'
        and created_at < (now() - interval '30 minutes')
      order by created_at asc
      limit 20
    `),
  );

  // -----------------------------
  // 2) Payments summary
  // -----------------------------
  const paymentsToday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(amount),0)::int as total
        from payments
        where location_id = ${locationId}
          and created_at >= ${todayStart}
      `),
  )[0] || { count: 0, total: 0 };

  const paymentsYesterday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(amount),0)::int as total
        from payments
        where location_id = ${locationId}
          and created_at >= ${yesterdayStart}
          and created_at < ${todayStart}
      `),
  )[0] || { count: 0, total: 0 };

  const paymentsAll = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(amount),0)::int as total
        from payments
        where location_id = ${locationId}
      `),
  )[0] || { count: 0, total: 0 };

  // -----------------------------
  // 3) Breakdown today
  // -----------------------------
  const breakdownToday = rowsOf(
    await db.execute(sql`
      select
        upper(coalesce(method::text,'OTHER')) as method,
        count(*)::int as count,
        coalesce(sum(amount),0)::int as total
      from payments
      where location_id = ${locationId}
        and created_at >= ${todayStart}
      group by 1
      order by total desc
    `),
  );

  // -----------------------------
  // 4) Last 10 payments
  // -----------------------------
  const lastPayments = rowsOf(
    await db.execute(sql`
      select
        id,
        sale_id as "saleId",
        amount,
        method,
        created_at as "createdAt"
      from payments
      where location_id = ${locationId}
      order by created_at desc
      limit 10
    `),
  );

  // -----------------------------
  // 5) Low stock (threshold <= 5)
  // NOTE: your schema has inventory_balances (NOT inventory)
  // -----------------------------
  const lowStockThreshold = 5;

  const lowStock = rowsOf(
    await db.execute(sql`
      select
        product_id as "productId",
        coalesce(qty_on_hand,0)::int as "qtyOnHand"
      from inventory_balances
      where location_id = ${locationId}
        and coalesce(qty_on_hand,0) <= ${lowStockThreshold}
      order by qty_on_hand asc
      limit 15
    `),
  );

  return {
    sales: {
      today: {
        count: Number(salesToday.count || 0),
        total: Number(salesToday.total || 0),
      },
      awaitingPayment: Number(awaitingPayment.count || 0),
      draft: Number(draftSales.count || 0),
      completedToday: Number(completedToday.count || 0),

      // widgets
      stuckRule,
      stuck: stuckSales.map((s) => ({
        id: s.id,
        status: s.status,
        totalAmount: Number(s.totalAmount || 0),
        createdAt: s.createdAt,
        ageSeconds: Number(s.ageSeconds || 0),
      })),
    },

    payments: {
      today: {
        count: Number(paymentsToday.count || 0),
        total: Number(paymentsToday.total || 0),
      },
      yesterday: {
        count: Number(paymentsYesterday.count || 0),
        total: Number(paymentsYesterday.total || 0),
      },
      allTime: {
        count: Number(paymentsAll.count || 0),
        total: Number(paymentsAll.total || 0),
      },

      breakdownToday: (Array.isArray(breakdownToday) ? breakdownToday : []).map(
        (r) => ({
          method: r.method,
          count: Number(r.count || 0),
          total: Number(r.total || 0),
        }),
      ),

      last10: (Array.isArray(lastPayments) ? lastPayments : []).map((p) => ({
        id: p.id,
        saleId: p.saleId,
        amount: Number(p.amount || 0),
        method: p.method,
        createdAt: p.createdAt,
      })),
    },

    inventory: {
      lowStockThreshold,
      lowStock: (Array.isArray(lowStock) ? lowStock : []).map((r) => ({
        productId: r.productId,
        qtyOnHand: Number(r.qtyOnHand || 0),
      })),
    },
  };
}

module.exports = { getManagerDashboard };
