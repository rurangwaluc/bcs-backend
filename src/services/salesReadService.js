const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

async function getSaleById({ locationId, saleId }) {
  const saleRes = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      s.seller_id as "sellerId",
      s.customer_id as "customerId",
      s.status,
      s.total_amount as "totalAmount",
      s.note,
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",
      s.canceled_at as "canceledAt",
      s.canceled_by as "canceledBy",
      s.cancel_reason as "cancelReason",
COALESCE(c.name, s.customer_name) as "customerName",
COALESCE(c.phone, s.customer_phone) as "customerPhone"

    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.location_id = ${locationId} AND s.id = ${saleId}
    LIMIT 1
  `);

  const saleRows = saleRes.rows || saleRes;
  const sale = saleRows[0];
  if (!sale) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      si.id,
      si.product_id as "productId",
      p.name as "productName",
      p.sku as "sku",
      si.qty,
      si.unit_price as "unitPrice",
      si.line_total as "lineTotal"
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ${saleId}
    ORDER BY si.id ASC
  `);

  const items = itemsRes.rows || itemsRes;

  return { ...sale, items };
}

async function listSales({ locationId, filters }) {
  const {
    status,
    sellerId,
    q,
    dateFrom,
    dateTo,
    limit = 50
  } = filters;

  // Build simple dynamic SQL safely
  const pattern = q ? `%${q}%` : null;

  const res = await db.execute(sql`
  SELECT
  s.id,
  s.status,
  s.total_amount as "totalAmount",
  s.created_at as "createdAt",
  s.seller_id as "sellerId",
  s.customer_id as "customerId",
  -- ✅ fallback to sale columns if customer table join is empty
  COALESCE(c.name, s.customer_name) as "customerName",
  COALESCE(c.phone, s.customer_phone) as "customerPhone"
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id

    WHERE s.location_id = ${locationId}
      ${status ? sql`AND s.status = ${status}` : sql``}
      ${sellerId ? sql`AND s.seller_id = ${Number(sellerId)}` : sql``}
      ${pattern ? sql`AND (c.name ILIKE ${pattern} OR c.phone ILIKE ${pattern})` : sql``}
      ${dateFrom ? sql`AND s.created_at >= ${new Date(dateFrom)}` : sql``}
      ${dateTo ? sql`AND s.created_at <= ${new Date(dateTo)}` : sql``}
    ORDER BY s.created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 50, 1), 200)}
  `);

  return res.rows || res;
}

module.exports = { getSaleById, listSales };
