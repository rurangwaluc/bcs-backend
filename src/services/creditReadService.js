"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeCreditRow(r) {
  if (!r) return null;

  const id = toInt(r.id ?? r.ID, null);
  const locationId = toInt(r.locationId ?? r.location_id, null);
  const saleId = toInt(r.saleId ?? r.sale_id, null);
  const customerId = toInt(r.customerId ?? r.customer_id, null);

  const principalAmount = toNum(
    r.principalAmount ?? r.principal_amount ?? r.amount,
    0,
  );

  const paidAmount = toNum(r.paidAmount ?? r.paid_amount, 0);

  const remainingAmount = toNum(
    r.remainingAmount ?? r.remaining_amount,
    Math.max(0, principalAmount - paidAmount),
  );

  const creditMode = r.creditMode ?? r.credit_mode ?? r.mode ?? "OPEN_BALANCE";
  const dueDate = r.dueDate ?? r.due_date ?? null;
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

  const rejectedBy = toInt(
    r.rejectedBy ??
      r.rejected_by ??
      r.rejected_by_user_id ??
      r.rejectedByUserId,
    null,
  );

  const rejectedAt = r.rejectedAt ?? r.rejected_at ?? null;

  const settledBy = toInt(
    r.settledBy ?? r.settled_by ?? r.settled_by_user_id ?? r.settledByUserId,
    null,
  );

  const settledAt = r.settledAt ?? r.settled_at ?? null;
  const note = r.note ?? null;
  const createdAt = r.createdAt ?? r.created_at ?? null;

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

    principalAmount,
    paidAmount,
    remainingAmount,
    creditMode,
    dueDate,

    // backward-compatible alias
    amount: principalAmount,

    status,
    createdBy,
    approvedBy,
    approvedAt,
    rejectedBy,
    rejectedAt,
    settledBy,
    settledAt,
    note,
    createdAt,
  };
}

/**
 * GET /credits?status=&q=&limit=&cursor=
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
          ? sql`AND (
              cu.name ILIKE ${pattern}
              OR cu.phone ILIKE ${pattern}
              OR CAST(c.id AS TEXT) ILIKE ${pattern}
              OR CAST(c.sale_id AS TEXT) ILIKE ${pattern}
            )`
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
 * GET /credits/:id
 * Returns:
 * { ...credit, items: [...], payments: [...], installments: [...] }
 */
async function getCreditById({ locationId, creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) return null;

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
    return { ...credit, items: [], payments: [], installments: [] };
  }

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
    qty: toNum(r.qty ?? 0, 0),
    unitPrice: toNum(r.unitPrice ?? r.unit_price ?? 0, 0),
    lineTotal: toNum(r.lineTotal ?? r.line_total ?? 0, 0),
  }));

  const payRes = await db.execute(sql`
    SELECT
      cp.id,
      cp.amount,
      cp.method,
      cp.note,
      cp.reference,
      cp.created_at as "createdAt",
      cp.received_by as "receivedBy",
      cp.cash_session_id as "cashSessionId"
    FROM credit_payments cp
    WHERE cp.location_id = ${locationId}
      AND cp.credit_id = ${id}
    ORDER BY cp.id ASC
  `);

  const payRaw = rowsOf(payRes);
  const payments = payRaw.map((p) => ({
    id: toInt(p.id, null),
    amount: toNum(p.amount ?? 0, 0),
    method: p.method ?? null,
    note: p.note ?? null,
    reference: p.reference ?? null,
    createdAt: p.createdAt ?? p.created_at ?? null,
    receivedBy: toInt(
      p.receivedBy ?? p.received_by ?? p.cashierId ?? p.cashier_id,
      null,
    ),
    cashSessionId: toInt(p.cashSessionId ?? p.cash_session_id, null),
  }));

  const instRes = await db.execute(sql`
    SELECT
      ci.id,
      ci.installment_no as "installmentNo",
      ci.amount,
      ci.paid_amount as "paidAmount",
      ci.remaining_amount as "remainingAmount",
      ci.due_date as "dueDate",
      ci.status,
      ci.paid_at as "paidAt",
      ci.note,
      ci.created_at as "createdAt"
    FROM credit_installments ci
    WHERE ci.location_id = ${locationId}
      AND ci.credit_id = ${id}
    ORDER BY ci.installment_no ASC, ci.id ASC
  `);

  const instRaw = rowsOf(instRes);
  const installments = instRaw.map((r) => ({
    id: toInt(r.id, null),
    installmentNo: toInt(r.installmentNo ?? r.installment_no, null),
    amount: toNum(r.amount ?? 0, 0),
    paidAmount: toNum(r.paidAmount ?? r.paid_amount ?? 0, 0),
    remainingAmount: toNum(r.remainingAmount ?? r.remaining_amount ?? 0, 0),
    dueDate: r.dueDate ?? r.due_date ?? null,
    status: r.status ?? null,
    paidAt: r.paidAt ?? r.paid_at ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
  }));

  return {
    ...credit,
    items,
    payments,
    installments,
  };
}

module.exports = {
  listCredits,
  getCreditById,
};
