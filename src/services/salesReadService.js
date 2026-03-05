// backend/src/services/salesReadService.js
"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function toLocationObj(row) {
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
      COALESCE(c.phone, s.customer_phone) as "customerPhone",
      c.tin as "customerTin",
      c.address as "customerAddress"
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

  const location = toLocationObj(sale);
  const { locationName, locationCode, ...rest } = sale;

  return { ...rest, location, items };
}

async function listSales({ locationId, filters }) {
  const { status, sellerId, q, dateFrom, dateTo, limit = 50 } = filters;

  const pattern = q ? `%${String(q)}%` : null;

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;

  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

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
      c.tin as "customerTin",
      c.address as "customerAddress",

      COALESCE(pay.sum_amount, 0)::int as "amountPaid",

      cr.id as "creditId",
      cr.status as "creditStatus",
      cr.amount::int as "creditAmount",
      cr.created_at as "creditCreatedAt",
      cr.settled_at as "creditSettledAt",

      COALESCE(items.items_preview, '[]'::json) as "itemsPreview"

    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.seller_id

    LEFT JOIN LATERAL (
      SELECT SUM(p.amount)::int as sum_amount
      FROM payments p
      WHERE p.sale_id = s.id
        AND p.location_id = s.location_id
    ) pay ON TRUE

    LEFT JOIN LATERAL (
      SELECT
        c2.id,
        c2.status,
        c2.amount,
        c2.created_at,
        c2.settled_at
      FROM credits c2
      WHERE c2.sale_id = s.id
        AND c2.location_id = s.location_id
      ORDER BY c2.id DESC
      LIMIT 1
    ) cr ON TRUE

    LEFT JOIN LATERAL (
      SELECT json_agg(x ORDER BY x."productName") as items_preview
      FROM (
        SELECT
          COALESCE(pr.name, CONCAT('Product #', si.product_id::text)) as "productName",
          si.qty::int as "qty",
          pr.sku as "sku"
        FROM sale_items si
        LEFT JOIN products pr
          ON pr.id = si.product_id AND pr.location_id = s.location_id
        WHERE si.sale_id = s.id
        ORDER BY si.id ASC
        LIMIT 3
      ) x
    ) items ON TRUE

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
          OR COALESCE(c.tin, '') ILIKE ${pattern}
          OR COALESCE(c.address, '') ILIKE ${pattern}
        )`
        : sql``
    }

    ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
    ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}

    ORDER BY s.created_at DESC
    LIMIT ${lim}
  `);

  const rows = res.rows || res || [];

  return rows.map((r) => {
    const location = toLocationObj(r);
    const { locationName, locationCode, ...rest } = r;

    const credit = r.creditId
      ? {
          id: r.creditId,
          status: r.creditStatus,
          amount: Number(r.creditAmount || 0),
          createdAt: r.creditCreatedAt,
          settledAt: r.creditSettledAt,
          paidAmount: Number(r.amountPaid || 0),
        }
      : null;

    const itemsPreview = Array.isArray(r.itemsPreview) ? r.itemsPreview : [];

    const {
      creditId,
      creditStatus,
      creditAmount,
      creditCreatedAt,
      creditSettledAt,
      ...clean
    } = rest;

    return {
      ...clean,
      location,
      credit,
      itemsPreview,
    };
  });
}

module.exports = { getSaleById, listSales };
