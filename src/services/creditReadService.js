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

  const createdBy =
    toInt(
      r.createdBy ??
        r.created_by ??
        r.created_by_user_id ??
        r.createdByUserId,
      null,
    );

  const approvedBy =
    toInt(
      r.approvedBy ??
        r.approved_by ??
        r.approved_by_user_id ??
        r.approvedByUserId,
      null,
    );

  const approvedAt = r.approvedAt ?? r.approved_at ?? null;

  const settledBy =
    toInt(
      r.settledBy ??
        r.settled_by ??
        r.settled_by_user_id ??
        r.settledByUserId,
      null,
    );

  const settledAt = r.settledAt ?? r.settled_at ?? null;

  const note = r.note ?? null;

  const createdAt = r.createdAt ?? r.created_at ?? null;

  // We alias these in SQL as customer_name/customer_phone to avoid clashes
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
async function listCredits({ locationId, status, q, limit = 50, cursor = null }) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pattern = q ? `%${String(q).trim()}%` : null;
  const cur = cursor ? Number(cursor) : null;
  const st = status ? String(status).trim().toUpperCase() : "";

  // KEY FIX:
  // - select c.* so we never crash when specific columns don't exist
  // - join customers for name/phone
  const res = await db.execute(sql`
    SELECT
      c.*,
      cu.name as "customer_name",
      cu.phone as "customer_phone"
    FROM credits c
    LEFT JOIN customers cu ON cu.id = c.customer_id
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

async function getCreditById({ locationId, creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const res = await db.execute(sql`
    SELECT
      c.*,
      cu.name as "customer_name",
      cu.phone as "customer_phone"
    FROM credits c
    LEFT JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId}
      AND c.id = ${id}
    LIMIT 1
  `);

  const raw = rowsOf(res);
  return normalizeCreditRow(raw[0]) || null;
}

module.exports = { listCredits, getCreditById };