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

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/**
 * Fetch a single sale by ID with credit info and items preview
 */
async function getSaleById({ locationId, saleId }) {
  const saleRes = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      s.seller_id as "sellerId",
      u.name as "sellerName",
      s.customer_id as "customerId",
      s.status,
      s.total_amount as "totalAmount",
      s.payment_method as "paymentMethod",
      s.note,
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",
      COALESCE(c.name, s.customer_name) as "customerName",
      COALESCE(c.phone, s.customer_phone) as "customerPhone",
      c.tin as "customerTin",
      c.address as "customerAddress",

      -- Payments sum
      COALESCE(p.sum_amount, 0)::int as "amountPaid",

      -- Credit info
      cr.id as "creditId",
      cr.status as "creditStatus",
      cr.principal_amount::bigint as "creditPrincipalAmount",
      cr.paid_amount::bigint as "creditPaidAmount",
      cr.remaining_amount::bigint as "creditRemainingAmount",
      cr.credit_mode as "creditMode",
      cr.due_date as "creditDueDate",
      cr.created_at as "creditCreatedAt",
      cr.approved_at as "creditApprovedAt",
      cr.settled_at as "creditSettledAt"

    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN users u ON u.id = s.seller_id
    LEFT JOIN customers c ON c.id = s.customer_id AND c.location_id = s.location_id

    LEFT JOIN LATERAL (
      SELECT SUM(p.amount)::int as sum_amount
      FROM payments p
      WHERE p.sale_id = s.id AND p.location_id = s.location_id
    ) p ON TRUE

    LEFT JOIN LATERAL (
      SELECT *
      FROM credits c2
      WHERE c2.sale_id = s.id AND c2.location_id = s.location_id
      ORDER BY c2.id DESC
      LIMIT 1
    ) cr ON TRUE

    WHERE s.location_id = ${locationId} AND s.id = ${saleId}
    LIMIT 1
  `);

  const saleRow = (saleRes.rows || saleRes || [])[0];
  if (!saleRow) return null;

  // Sale items
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
    LEFT JOIN products p ON p.id = si.product_id AND p.location_id = ${locationId}
    WHERE si.sale_id = ${saleId}
    ORDER BY si.id ASC
  `);

  const items = (itemsRes.rows || itemsRes || []).map((it) => ({
    id: toInt(it.id, null),
    productId: toInt(it.productId, null),
    productName: it.productName ?? null,
    sku: it.sku ?? null,
    qty: toInt(it.qty, 0),
    unitPrice: toInt(it.unitPrice, 0),
    lineTotal: toInt(it.lineTotal, 0),
  }));

  const location = toLocationObj(saleRow);

  const credit = saleRow.creditId
    ? {
        id: toInt(saleRow.creditId, null),
        status: saleRow.creditStatus ?? null,
        principalAmount: toInt(saleRow.creditPrincipalAmount, 0),
        paidAmount: toInt(saleRow.creditPaidAmount, 0),
        remainingAmount: toInt(saleRow.creditRemainingAmount, 0),
        creditMode: saleRow.creditMode ?? null,
        dueDate: saleRow.creditDueDate ?? null,
        createdAt: saleRow.creditCreatedAt ?? null,
        approvedAt: saleRow.creditApprovedAt ?? null,
        settledAt: saleRow.creditSettledAt ?? null,
      }
    : null;

  const {
    locationName,
    locationCode,
    creditId,
    creditStatus,
    creditPrincipalAmount,
    creditPaidAmount,
    creditRemainingAmount,
    creditMode,
    creditDueDate,
    creditCreatedAt,
    creditApprovedAt,
    creditSettledAt,
    ...rest
  } = saleRow;

  return {
    ...rest,
    location,
    items,
    amountPaid: toInt(saleRow.amountPaid, 0),
    totalAmount: toInt(saleRow.totalAmount, 0),
    credit,
  };
}

/**
 * List sales with optional filters and credit info
 */
async function listSales({ locationId, filters }) {
  const { status, sellerId, q, dateFrom, dateTo, limit = 50 } = filters || {};
  const pattern = q ? `%${String(q).trim()}%` : null;

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
      cr.principal_amount::bigint as "creditPrincipalAmount",
      cr.paid_amount::bigint as "creditPaidAmount",
      cr.remaining_amount::bigint as "creditRemainingAmount",
      cr.credit_mode as "creditMode",
      cr.due_date as "creditDueDate",
      cr.created_at as "creditCreatedAt",
      cr.approved_at as "creditApprovedAt",
      cr.settled_at as "creditSettledAt",

      COALESCE(items.items_preview, '[]'::json) as "itemsPreview"

    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN customers c ON c.id = s.customer_id AND c.location_id = s.location_id
    LEFT JOIN users u ON u.id = s.seller_id

    LEFT JOIN LATERAL (
      SELECT SUM(p.amount)::int as sum_amount
      FROM payments p
      WHERE p.sale_id = s.id AND p.location_id = s.location_id
    ) pay ON TRUE

    LEFT JOIN LATERAL (
      SELECT *
      FROM credits c2
      WHERE c2.sale_id = s.id AND c2.location_id = s.location_id
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
        LEFT JOIN products pr ON pr.id = si.product_id AND pr.location_id = s.location_id
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

    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ${lim}
  `);

  const rows = res.rows || res || [];

  return rows.map((r) => {
    const location = toLocationObj(r);

    const credit = r.creditId
      ? {
          id: toInt(r.creditId, null),
          status: r.creditStatus ?? null,
          principalAmount: toInt(r.creditPrincipalAmount, 0),
          paidAmount: toInt(r.creditPaidAmount, 0),
          remainingAmount: toInt(r.creditRemainingAmount, 0),
          creditMode: r.creditMode ?? null,
          dueDate: r.creditDueDate ?? null,
          createdAt: r.creditCreatedAt ?? null,
          approvedAt: r.creditApprovedAt ?? null,
          settledAt: r.creditSettledAt ?? null,
        }
      : null;

    const itemsPreview = Array.isArray(r.itemsPreview) ? r.itemsPreview : [];

    const {
      locationName,
      locationCode,
      creditId,
      creditStatus,
      creditPrincipalAmount,
      creditPaidAmount,
      creditRemainingAmount,
      creditMode,
      creditDueDate,
      creditCreatedAt,
      creditApprovedAt,
      creditSettledAt,
      ...clean
    } = r;

    return {
      ...clean,
      totalAmount: toInt(r.totalAmount, 0),
      amountPaid: toInt(r.amountPaid, 0),
      location,
      credit,
      itemsPreview,
    };
  });
}

/**
 * Fetch all payments for a given credit
 */
async function getCreditPayments({ locationId, creditId }) {
  const res = await db.execute(sql`
    SELECT
      p.id,
      p.amount,
      p.method,
      p.note,
      p.reference,
      p.created_at as "createdAt",
      p.received_by as "receivedBy",
      p.cash_session_id as "cashSessionId"
    FROM payments p
    WHERE p.credit_id = ${creditId} AND p.location_id = ${locationId}
    ORDER BY p.created_at ASC, p.id ASC
  `);

  return (res.rows || res || []).map((r) => ({
    id: toInt(r.id, null),
    amount: toInt(r.amount, 0),
    method: r.method ?? null,
    note: r.note ?? null,
    reference: r.reference ?? null,
    createdAt: r.createdAt ?? null,
    receivedBy: r.receivedBy ?? null,
    cashSessionId: r.cashSessionId ?? null,
  }));
}

module.exports = { getSaleById, listSales, getCreditPayments };
