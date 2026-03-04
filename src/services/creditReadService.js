// backend/src/services/creditReadService.js
"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Normalize ANY credits row into a stable shape,
 * even if DB columns differ (approved_by vs approved_by_user_id, etc.)
 */
function normalizeCreditRow(r) {
  if (!r) return null;

  const id = toInt(r.id ?? r.ID, null);

  const locationId = toInt(r.locationId ?? r.location_id, null);
  const saleId = toInt(r.saleId ?? r.sale_id, null);
  const customerId = toInt(r.customerId ?? r.customer_id, null);

  const amount = Number(r.amount ?? 0);
  const status = r.status ?? null;

  const createdBy = toInt(
    r.createdBy ?? r.created_by ?? r.created_by_user_id ?? r.createdByUserId,
    null,
  );

  const approvedBy = toInt(
    r.approvedBy ??
      r.approved_by ??
      r.approved_by_user_id ??
      r.approvedByUserId,
    null,
  );

  const approvedAt = r.approvedAt ?? r.approved_at ?? null;

  const settledBy = toInt(
    r.settledBy ?? r.settled_by ?? r.settled_by_user_id ?? r.settledByUserId,
    null,
  );

  const settledAt = r.settledAt ?? r.settled_at ?? null;

  const note = r.note ?? null;

  const createdAt = r.createdAt ?? r.created_at ?? null;

  // We alias these in SQL as customer_name/customer_phone
  const customerName =
    r.customerName ?? r.customer_name ?? r.customerNameJoin ?? null;

  const customerPhone =
    r.customerPhone ?? r.customer_phone ?? r.customerPhoneJoin ?? null;

  return {
    id,
    locationId,
    saleId,
    customerId,
    customerName,
    customerPhone,
    amount: Number.isFinite(amount) ? amount : 0,
    status,
    createdBy,
    approvedBy,
    approvedAt,
    settledBy,
    settledAt,
    note,
    createdAt,
  };
}

/**
 * listCredits returns EXACT shape your controller expects:
 * { rows, nextCursor }
 */
async function listCredits({
  locationId,
  status,
  q,
  limit = 50,
  cursor = null,
}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pattern = q ? `%${String(q).trim()}%` : null;
  const cur = cursor ? Number(cursor) : null;
  const st = status ? String(status).trim().toUpperCase() : "";

  const res = await db.execute(sql`
    SELECT
      c.*,
      cu.name as "customer_name",
      cu.phone as "customer_phone"
    FROM credits c
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
      AND cu.location_id = c.location_id
    WHERE c.location_id = ${locationId}
      ${st ? sql`AND c.status = ${st}` : sql``}
      ${
        pattern
          ? sql`AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})`
          : sql``
      }
      ${cur ? sql`AND c.id < ${cur}` : sql``}
    ORDER BY c.id DESC
    LIMIT ${lim}
  `);

  const raw = rowsOf(res);
  const rows = raw.map(normalizeCreditRow).filter(Boolean);

  const nextCursor = rows.length === lim ? rows[rows.length - 1]?.id : null;
  return { rows, nextCursor };
}

/**
 * getCreditById returns:
 * { ...credit, items: [...], payments: [...] }
 *
 * - items come from sale_items + products
 * - payments come from payments table (0..1 in your current schema)
 */
async function getCreditById({ locationId, creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) return null;

  // 1) Credit core + customer join
  const res = await db.execute(sql`
    SELECT
      c.*,
      cu.name as "customer_name",
      cu.phone as "customer_phone"
    FROM credits c
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
      AND cu.location_id = c.location_id
    WHERE c.location_id = ${locationId}
      AND c.id = ${id}
    LIMIT 1
  `);

  const raw = rowsOf(res);
  const credit = normalizeCreditRow(raw[0]) || null;
  if (!credit) return null;

  const saleId = Number(credit.saleId);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return { ...credit, items: [], payments: [] };
  }

  // 2) Sale items + products
  // NOTE: assumes tables are named: sale_items, products
  const itemsRes = await db.execute(sql`
    SELECT
      si.id,
      si.product_id as "productId",
      si.qty as "qty",
      si.unit_price as "unitPrice",
      si.line_total as "lineTotal",
      p.name as "productName",
      p.sku as "sku"
    FROM sale_items si
    LEFT JOIN products p
      ON p.id = si.product_id
      AND p.location_id = ${locationId}
    WHERE si.sale_id = ${saleId}
    ORDER BY si.id ASC
  `);

  const itemsRaw = rowsOf(itemsRes);
  const items = itemsRaw.map((r) => ({
    id: toInt(r.id, null),
    productId: toInt(r.productId ?? r.product_id, null),
    productName: r.productName ?? r.product_name ?? null,
    sku: r.sku ?? null,
    qty: Number(r.qty ?? 0) || 0,
    unitPrice: Number(r.unitPrice ?? r.unit_price ?? 0) || 0,
    lineTotal: Number(r.lineTotal ?? r.line_total ?? 0) || 0,
  }));

  // 3) Payments for that sale
  // In your current schema, usually 0..1, but returning array keeps you future-proof for installments.
  const payRes = await db.execute(sql`
    SELECT
      p.id,
      p.amount,
      p.method,
      p.note,
      p.created_at as "createdAt",
      p.cashier_id as "cashierId"
    FROM payments p
    WHERE p.location_id = ${locationId}
      AND p.sale_id = ${saleId}
    ORDER BY p.id ASC
  `);

  const payRaw = rowsOf(payRes);
  const payments = payRaw.map((p) => ({
    id: toInt(p.id, null),
    amount: Number(p.amount ?? 0) || 0,
    method: p.method ?? null,
    note: p.note ?? null,
    createdAt: p.createdAt ?? p.created_at ?? null,
    cashierId: toInt(p.cashierId ?? p.cashier_id, null),
  }));

  return { ...credit, items, payments };
}

module.exports = { listCredits, getCreditById };
