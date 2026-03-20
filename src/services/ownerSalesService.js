"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const salesService = require("./salesService");

function toInt(n, def = null) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}

function clampLimit(n, def = 50, max = 200) {
  const x = toInt(n, def);
  if (!Number.isInteger(x) || x <= 0) return def;
  return Math.min(x, max);
}

function clampOffset(n) {
  const x = toInt(n, 0);
  if (!Number.isInteger(x) || x < 0) return 0;
  return x;
}

function toLocationObj(row) {
  if (!row || row.locationId == null) return null;
  return {
    id: String(row.locationId),
    name: row.locationName ?? null,
    code: row.locationCode ?? null,
  };
}

function buildFilters({ locationId, status, sellerId, q, dateFrom, dateTo }) {
  const parsedLocationId = toInt(locationId, null);
  const parsedSellerId = toInt(sellerId, null);
  const pattern = q ? `%${String(q).trim()}%` : null;

  const dateFromTs = dateFrom ? new Date(dateFrom) : null;
  const dateToTs = dateTo ? new Date(dateTo) : null;
  const dateToNextDay = dateToTs
    ? new Date(dateToTs.getTime() + 24 * 60 * 60 * 1000)
    : null;

  return {
    parsedLocationId,
    parsedSellerId,
    status: status ? String(status) : null,
    pattern,
    dateFromTs,
    dateToNextDay,
  };
}

async function getSaleContextOrThrow(saleId) {
  const parsedSaleId = toInt(saleId, null);
  if (!parsedSaleId || parsedSaleId <= 0) {
    const err = new Error("Invalid sale id");
    err.code = "BAD_SALE_ID";
    throw err;
  }

  const res = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      s.seller_id as "sellerId",
      s.status
    FROM sales s
    WHERE s.id = ${parsedSaleId}
    LIMIT 1
  `);

  const rows = res.rows || res || [];
  const sale = rows[0];

  if (!sale) {
    const err = new Error("Sale not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return sale;
}

async function getOwnerSalesSummary(filters = {}) {
  const {
    parsedLocationId,
    parsedSellerId,
    status,
    pattern,
    dateFromTs,
    dateToNextDay,
  } = buildFilters(filters);

  const totalsRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT s.location_id)::int as "branchesCount",
      COUNT(*)::int as "salesCount",
      COALESCE(SUM(s.total_amount), 0)::bigint as "totalSalesAmount",

      COUNT(*) FILTER (WHERE s.status = 'DRAFT')::int as "draftCount",
      COUNT(*) FILTER (WHERE s.status = 'FULFILLED')::int as "fulfilledCount",
      COUNT(*) FILTER (WHERE s.status = 'PENDING')::int as "pendingCount",
      COUNT(*) FILTER (WHERE s.status = 'AWAITING_PAYMENT_RECORD')::int as "awaitingPaymentRecordCount",
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int as "completedCount",
      COUNT(*) FILTER (WHERE s.status = 'CANCELLED')::int as "cancelledCount"
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.seller_id
    WHERE 1 = 1
    ${parsedLocationId ? sql`AND s.location_id = ${parsedLocationId}` : sql``}
    ${status ? sql`AND s.status = ${status}` : sql``}
    ${parsedSellerId ? sql`AND s.seller_id = ${parsedSellerId}` : sql``}
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
  `);

  const byLocationRes = await db.execute(sql`
    SELECT
      l.id::int as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      l.status as "locationStatus",

      COUNT(s.id)::int as "salesCount",
      COALESCE(SUM(s.total_amount), 0)::bigint as "totalSalesAmount",

      COUNT(*) FILTER (WHERE s.status = 'DRAFT')::int as "draftCount",
      COUNT(*) FILTER (WHERE s.status = 'FULFILLED')::int as "fulfilledCount",
      COUNT(*) FILTER (WHERE s.status = 'PENDING')::int as "pendingCount",
      COUNT(*) FILTER (WHERE s.status = 'AWAITING_PAYMENT_RECORD')::int as "awaitingPaymentRecordCount",
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int as "completedCount",
      COUNT(*) FILTER (WHERE s.status = 'CANCELLED')::int as "cancelledCount"
    FROM locations l
    LEFT JOIN sales s
      ON s.location_id = l.id
      ${status ? sql`AND s.status = ${status}` : sql``}
      ${parsedSellerId ? sql`AND s.seller_id = ${parsedSellerId}` : sql``}
      ${dateFromTs ? sql`AND s.created_at >= ${dateFromTs}` : sql``}
      ${dateToNextDay ? sql`AND s.created_at < ${dateToNextDay}` : sql``}
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.seller_id
    WHERE 1 = 1
    ${parsedLocationId ? sql`AND l.id = ${parsedLocationId}` : sql``}
    ${
      pattern
        ? sql`AND (
          s.id IS NULL OR
          COALESCE(c.name, s.customer_name) ILIKE ${pattern}
          OR COALESCE(c.phone, s.customer_phone) ILIKE ${pattern}
          OR CAST(s.id AS TEXT) ILIKE ${pattern}
          OR COALESCE(u.name, '') ILIKE ${pattern}
        )`
        : sql``
    }
    GROUP BY l.id, l.name, l.code, l.status
    ORDER BY l.name ASC
  `);

  const totalsRows = totalsRes.rows || totalsRes || [];
  const byLocationRows = byLocationRes.rows || byLocationRes || [];

  return {
    totals: totalsRows[0] || {
      branchesCount: 0,
      salesCount: 0,
      totalSalesAmount: 0,
      draftCount: 0,
      fulfilledCount: 0,
      pendingCount: 0,
      awaitingPaymentRecordCount: 0,
      completedCount: 0,
      cancelledCount: 0,
    },
    byLocation: byLocationRows,
  };
}

async function listOwnerSales(filters = {}) {
  const {
    parsedLocationId,
    parsedSellerId,
    status,
    pattern,
    dateFromTs,
    dateToNextDay,
  } = buildFilters(filters);

  const limit = clampLimit(filters.limit, 50, 200);
  const offset = clampOffset(filters.offset);

  const res = await db.execute(sql`
    SELECT
      s.id,
      s.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      s.status,
      s.total_amount as "totalAmount",
      s.payment_method as "paymentMethod",
      s.note,
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",
      s.canceled_at as "canceledAt",
      s.canceled_by as "canceledBy",
      s.cancel_reason as "cancelReason",

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
      cr.principal_amount::int as "creditAmount",
      cr.paid_amount::int as "creditPaidAmount",
      cr.remaining_amount::int as "creditRemainingAmount",
      cr.credit_mode as "creditMode",
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
        c2.principal_amount,
        c2.paid_amount,
        c2.remaining_amount,
        c2.credit_mode,
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
          ON pr.id = si.product_id
         AND pr.location_id = s.location_id
        WHERE si.sale_id = s.id
        ORDER BY si.id ASC
        LIMIT 3
      ) x
    ) items ON TRUE

    WHERE 1 = 1
    ${parsedLocationId ? sql`AND s.location_id = ${parsedLocationId}` : sql``}
    ${status ? sql`AND s.status = ${status}` : sql``}
    ${parsedSellerId ? sql`AND s.seller_id = ${parsedSellerId}` : sql``}
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
    LIMIT ${limit}
    OFFSET ${offset}
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
          principalAmount: Number(r.creditAmount || 0),
          paidAmount: Number(r.creditPaidAmount || 0),
          remainingAmount: Number(r.creditRemainingAmount || 0),
          creditMode: r.creditMode || "OPEN_BALANCE",
          createdAt: r.creditCreatedAt,
          settledAt: r.creditSettledAt,
        }
      : null;

    const itemsPreview = Array.isArray(r.itemsPreview) ? r.itemsPreview : [];

    const {
      creditId,
      creditStatus,
      creditAmount,
      creditPaidAmount,
      creditRemainingAmount,
      creditMode,
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

async function getOwnerSaleById({ saleId }) {
  const parsedSaleId = toInt(saleId, null);
  if (!parsedSaleId || parsedSaleId <= 0) return null;

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
      c.address as "customerAddress",
      u.name as "sellerName"
    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.seller_id
    WHERE s.id = ${parsedSaleId}
    LIMIT 1
  `);

  const saleRows = saleRes.rows || saleRes || [];
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
    LEFT JOIN products p
      ON p.id = si.product_id
     AND p.location_id = ${sale.locationId}
    WHERE si.sale_id = ${parsedSaleId}
    ORDER BY si.id ASC
  `);

  const items = itemsRes.rows || itemsRes || [];
  const location = toLocationObj(sale);
  const { locationName, locationCode, ...rest } = sale;

  return { ...rest, location, items };
}

async function ownerCancelSale({ actorUserId, saleId, reason }) {
  const sale = await getSaleContextOrThrow(saleId);

  return salesService.cancelSale({
    locationId: sale.locationId,
    userId: actorUserId,
    saleId: sale.id,
    reason,
  });
}

async function ownerFulfillSale({ actorUserId, saleId, note }) {
  const sale = await getSaleContextOrThrow(saleId);

  return salesService.fulfillSale({
    locationId: sale.locationId,
    storeKeeperId: actorUserId,
    saleId: sale.id,
    note,
  });
}

async function ownerMarkSale({ actorUserId, saleId, status, paymentMethod }) {
  const sale = await getSaleContextOrThrow(saleId);

  return salesService.markSale({
    locationId: sale.locationId,
    saleId: sale.id,
    status,
    paymentMethod,
    userId: actorUserId,
    bypassOwnershipCheck: true,
  });
}

module.exports = {
  getOwnerSalesSummary,
  listOwnerSales,
  getOwnerSaleById,
  ownerCancelSale,
  ownerFulfillSale,
  ownerMarkSale,
};
