const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

async function ownerSummary({ locationId }) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Products count
  const productsCountRes = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE location_id = ${locationId}
  `);

  // Inventory totals
  const inventoryRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(qty_on_hand), 0)::int AS totalQty
    FROM inventory_balances
    WHERE location_id = ${locationId}
  `);

  // Sales status counts + totals (all-time)
  const salesRes = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int AS count,
      COALESCE(SUM(total_amount), 0)::int AS total
    FROM sales
    WHERE location_id = ${locationId}
    GROUP BY status
  `);

  // Sales totals today
  const salesTodayRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(total_amount), 0)::int AS total
    FROM sales
    WHERE location_id = ${locationId}
      AND created_at >= ${startOfDay}
      AND created_at <= ${endOfDay}
  `);

  // Payments totals (all-time)
  const paymentsRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(amount), 0)::int AS total
    FROM payments
    WHERE location_id = ${locationId}
  `);

  // Payments totals today
  const paymentsTodayRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(amount), 0)::int AS total
    FROM payments
    WHERE location_id = ${locationId}
      AND created_at >= ${startOfDay}
      AND created_at <= ${endOfDay}
  `);

  // Recent activity (audit logs)
  const activityRes = await db.execute(sql`
    SELECT id, user_id as "userId", action, entity, entity_id as "entityId", description, created_at as "createdAt"
    FROM audit_logs
    WHERE created_at IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return {
    productsCount: productsCountRes.rows[0].count,
    inventory: inventoryRes.rows[0],
    salesByStatus: salesRes.rows,
    salesToday: salesTodayRes.rows[0],
    paymentsAllTime: paymentsRes.rows[0],
    paymentsToday: paymentsTodayRes.rows[0],
    recentActivity: activityRes.rows
  };
}

module.exports = { ownerSummary };
