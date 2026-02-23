// backend/src/services/creditReadService.js
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

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
      c.id,
      c.location_id as "locationId",
      c.sale_id as "saleId",
      c.customer_id as "customerId",
      cu.name as "customerName",
      cu.phone as "customerPhone",
      c.amount,
      c.status,
      c.created_by as "createdBy",
      c.approved_by as "approvedBy",
      c.approved_at as "approvedAt",
      c.settled_by as "settledBy",
      c.settled_at as "settledAt",
      c.note,
      c.created_at as "createdAt"
    FROM credits c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId}
      ${st ? sql`AND c.status = ${st}` : sql``}
      ${pattern ? sql`AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})` : sql``}
      ${cur ? sql`AND c.id < ${cur}` : sql``}
    ORDER BY c.id DESC
    LIMIT ${lim}
  `);

  const rows = res.rows || res;
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;
  return { rows, nextCursor };
}

async function getCreditById({ locationId, creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const res = await db.execute(sql`
    SELECT
      c.id,
      c.location_id as "locationId",
      c.sale_id as "saleId",
      c.customer_id as "customerId",
      c.amount,
      c.status,
      c.created_by as "createdBy",
      c.approved_by as "approvedBy",
      c.approved_at as "approvedAt",
      c.settled_by as "settledBy",
      c.settled_at as "settledAt",
      c.note,
      c.created_at as "createdAt",
      cu.name as "customerName",
      cu.phone as "customerPhone"
    FROM credits c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId} AND c.id = ${id}
    LIMIT 1
  `);

  const rows = res.rows || res;
  return rows[0] || null;
}

module.exports = { listCredits, getCreditById };
