// backend/src/services/adminDashboardService.js
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(r) {
  return r?.rows || r || [];
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getAdminDashboard({ locationId }) {
  const todayStart = sql`date_trunc('day', now())`;
  const yesterdayStart = sql`date_trunc('day', now()) - interval '1 day'`;

  // 1) Sales KPIs
  const salesToday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(total_amount),0)::bigint as total
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

  // 2) Stuck sales (Admin: exclude COMPLETED/CANCELLED/REFUNDED)
  const stuck = rowsOf(
    await db.execute(sql`
      select
        id,
        status,
        total_amount as "totalAmount",
        created_at as "createdAt",
        extract(epoch from (now() - created_at))::int as "ageSeconds"
      from sales
      where location_id = ${locationId}
        and status not in ('COMPLETED','CANCELLED','REFUNDED')
        and created_at < (now() - interval '30 minutes')
      order by created_at asc
      limit 20
    `),
  ).map((s) => ({
    ...s,
    totalAmount: toInt(s.totalAmount),
    ageSeconds: toInt(s.ageSeconds),
  }));

  // 3) Payments summary
  const paymentsToday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(amount),0)::bigint as total
        from payments
        where location_id = ${locationId}
          and created_at >= ${todayStart}
      `),
  )[0] || { count: 0, total: 0 };

  const paymentsYesterday = rowsOf(
    await db.execute(sql`
        select
          count(*)::int as count,
          coalesce(sum(amount),0)::bigint as total
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
          coalesce(sum(amount),0)::bigint as total
        from payments
        where location_id = ${locationId}
      `),
  )[0] || { count: 0, total: 0 };

  // 4) Payment breakdown (today)
  const breakdownToday = rowsOf(
    await db.execute(sql`
      select
        upper(coalesce(method::text,'OTHER')) as method,
        count(*)::int as count,
        coalesce(sum(amount),0)::bigint as total
      from payments
      where location_id = ${locationId}
        and created_at >= ${todayStart}
      group by 1
      order by total desc
    `),
  ).map((r) => ({
    method: r.method,
    count: toInt(r.count),
    total: toInt(r.total),
  }));

  // 5) Last 10 payments
  const last10 = rowsOf(
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
  ).map((p) => ({
    id: p.id,
    saleId: p.saleId,
    amount: toInt(p.amount),
    method: p.method || "OTHER",
    createdAt: p.createdAt,
  }));

  // 6) Low stock (inventory_balances)
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
  ).map((r) => ({
    productId: r.productId,
    qtyOnHand: toInt(r.qtyOnHand),
  }));

  return {
    sales: {
      today: {
        count: toInt(salesToday.count),
        total: toInt(salesToday.total),
      },
      awaitingPayment: toInt(awaitingPayment.count),
      draft: toInt(draftSales.count),
      completedToday: toInt(completedToday.count),
      stuck,
      stuckRule: "Not COMPLETED/CANCELLED/REFUNDED and older than 30 minutes",
    },
    payments: {
      today: {
        count: toInt(paymentsToday.count),
        total: toInt(paymentsToday.total),
      },
      yesterday: {
        count: toInt(paymentsYesterday.count),
        total: toInt(paymentsYesterday.total),
      },
      allTime: {
        count: toInt(paymentsAll.count),
        total: toInt(paymentsAll.total),
      },
      breakdownToday,
      last10,
    },
    inventory: {
      lowStock,
      lowStockThreshold,
    },
  };
}

module.exports = { getAdminDashboard };
