// backend/src/services/salesReadService.js
"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function toLocationObj(row) {
  // row may include: locationId, locationName, locationCode
  if (!row || row.locationId == null) return null;
  return {
    id: String(row.locationId),
    name: row.locationName ?? null,
    code: row.locationCode ?? null,
  };
}

async function getSaleById({ locationId, saleId }) {
  const saleRes = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      s.seller_id as "sellerId",
      s.customer_id as "customerId",
      s.status,
      s.total_amount as "totalAmount",
      s.payment_method as "paymentMethod",
      s.note,
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",
      s.canceled_at as "canceledAt",
      s.canceled_by as "canceledBy",
      s.cancel_reason as "cancelReason",
      COALESCE(c.name, s.customer_name) as "customerName",
      COALESCE(c.phone, s.customer_phone) as "customerPhone"
    FROM sales s
    JOIN locations l ON l.id = s.location_id
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

  // ✅ Add location object (keep locationId too)
  const location = toLocationObj(sale);

  // Clean up extra join fields so response is tidy
  const { locationName, locationCode, ...rest } = sale;

  return { ...rest, location, items };
}

async function listSales({ locationId, filters }) {
  const { status, sellerId, q, dateFrom, dateTo, limit = 50 } = filters;

  const pattern = q ? `%${String(q)}%` : null;

  // Safer date range: created_at >= dateFrom AND created_at < (dateTo + 1 day)
  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;

  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  const res = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      s.status,
      s.total_amount as "totalAmount",
      s.payment_method as "paymentMethod",
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",

      s.seller_id as "sellerId",
      u.name as "sellerName",

      s.customer_id as "customerId",
      COALESCE(c.name, s.customer_name) as "customerName",
      COALESCE(c.phone, s.customer_phone) as "customerPhone",

      COALESCE(SUM(p.amount), 0) as "amountPaid"

    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN customers c ON c.id = s.customer_id

    -- staff name
    LEFT JOIN users u ON u.id = s.seller_id

    -- paid amount
    LEFT JOIN payments p ON p.sale_id = s.id

    WHERE s.location_id = ${locationId}

    ${status ? sql`AND s.status = ${String(status)}` : sql``}
    ${sellerId ? sql`AND s.seller_id = ${Number(sellerId)}` : sql``}

    ${
      pattern
        ? sql`AND (
          COALESCE(c.name, s.customer_name) ILIKE ${pattern}
          OR COALESCE(c.phone, s.customer_phone) ILIKE ${pattern}
          OR CAST(s.id AS TEXT) ILIKE ${pattern}
          OR COALESCE(u.name, '') ILIKE ${pattern}
        )`
        : sql``
    }

    ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
    ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}

    GROUP BY
      s.id, s.location_id, l.name, l.code,
      s.status, s.total_amount, s.payment_method, s.created_at, s.updated_at,
      s.seller_id, u.name,
      s.customer_id, c.name, c.phone, s.customer_name, s.customer_phone

    ORDER BY s.created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 50, 1), 200)}
  `);

  const rows = res.rows || res;

  return rows.map((r) => {
    const location = toLocationObj(r);
    const { locationName, locationCode, ...rest } = r;
    return { ...rest, location };
  });
}

module.exports = { getSaleById, listSales };