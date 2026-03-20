"use strict";

const { db } = require("../config/db");
const { customers } = require("../db/schema/customers.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

function normPhone(v) {
  if (v == null) return "";
  return String(v)
    .trim()
    .replace(/[\s\-()]/g, "");
}

function normName(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normTin(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normAddress(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normNotes(v) {
  if (v == null) return "";
  return String(v).trim();
}

function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isUniqueViolation(err) {
  return err && (err.code === "23505" || err.sqlState === "23505");
}

async function writeAudit({
  locationId,
  actorId,
  action,
  entityId,
  description,
  meta = null,
}) {
  await db.insert(auditLogs).values({
    locationId,
    userId: actorId,
    action,
    entity: "customer",
    entityId,
    description,
    meta,
  });
}

async function createCustomer({ locationId, actorId, data }) {
  if (!locationId) throw new Error("Missing locationId");
  if (!actorId) throw new Error("Missing actorId");

  const phone = normPhone(data?.phone);
  const name = normName(data?.name);
  const tin = normTin(data?.tin);
  const address = normAddress(data?.address);
  const notes = normNotes(data?.notes);

  if (!phone) {
    const err = new Error("Phone is required");
    err.code = "VALIDATION";
    throw err;
  }

  if (!name) {
    const err = new Error("Name is required");
    err.code = "VALIDATION";
    throw err;
  }

  const existing = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.locationId, locationId), eq(customers.phone, phone)),
    );

  if (existing[0]) {
    const current = existing[0];
    const patch = {};

    if (name && current.name !== name) patch.name = name;
    if (tin !== (current.tin || "")) patch.tin = tin || null;
    if (address !== (current.address || "")) patch.address = address || null;
    if (notes !== (current.notes || "")) patch.notes = notes || null;

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date();

      const [updated] = await db
        .update(customers)
        .set(patch)
        .where(eq(customers.id, current.id))
        .returning();

      await writeAudit({
        locationId,
        actorId,
        action: "CUSTOMER_UPDATE",
        entityId: current.id,
        description: `Customer updated: ${updated?.name || current.name}`,
        meta: {
          fields: Object.keys(patch).filter((k) => k !== "updatedAt"),
        },
      });

      return updated || current;
    }

    return current;
  }

  try {
    const now = new Date();

    const [created] = await db
      .insert(customers)
      .values({
        locationId,
        name,
        phone,
        tin: tin || null,
        address: address || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit({
      locationId,
      actorId,
      action: "CUSTOMER_CREATE",
      entityId: created.id,
      description: `Customer created: ${created.name}`,
      meta: {
        phone: created.phone,
      },
    });

    return created;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;

    const rows = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.locationId, locationId), eq(customers.phone, phone)),
      );

    if (rows[0]) return rows[0];
    throw e;
  }
}

async function searchCustomers({ locationId, q }) {
  const qq = String(q || "").trim();
  if (!qq) return [];

  const namePattern = `%${qq}%`;
  const qPhone = normPhone(qq);
  const phonePattern = qPhone ? `%${qPhone}%` : null;

  const res = await db.execute(sql`
    SELECT
      c.id,
      c.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      c.name,
      c.phone,
      c.tin,
      c.address,
      c.notes,
      c.created_at as "createdAt",
      c.updated_at as "updatedAt"
    FROM customers c
    LEFT JOIN locations l ON l.id = c.location_id
    WHERE
      ${locationId == null ? sql`TRUE` : sql`c.location_id = ${locationId}`}
      AND (
        c.name ILIKE ${namePattern}
        ${phonePattern ? sql`OR c.phone ILIKE ${phonePattern}` : sql``}
      )
    ORDER BY
      ${
        qPhone
          ? sql`
            CASE
              WHEN c.phone = ${qPhone} THEN 0
              WHEN c.phone ILIKE ${qPhone + "%"} THEN 1
              WHEN c.phone ILIKE ${"%" + qPhone + "%"} THEN 2
              WHEN c.name ILIKE ${namePattern} THEN 3
              ELSE 4
            END
          `
          : sql`
            CASE
              WHEN c.name ILIKE ${namePattern} THEN 0
              ELSE 1
            END
          `
      },
      c.created_at DESC
    LIMIT 20
  `);

  return res.rows || res;
}

async function listCustomers({ locationId, limit = 50, cursor = null }) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const cursorId = toInt(cursor, null);

  const res = await db.execute(sql`
    SELECT
      c.id,
      c.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",
      c.name,
      c.phone,
      c.tin,
      c.address,
      c.notes,
      c.created_at as "createdAt",
      c.updated_at as "updatedAt",

      COALESCE((
        SELECT COUNT(*)::int
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.location_id = c.location_id
      ), 0) as "salesCount",

      COALESCE((
        SELECT SUM(s.total_amount)::bigint
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.location_id = c.location_id
      ), 0) as "salesTotalAmount",

      COALESCE((
        SELECT SUM(cr.remaining_amount)::bigint
        FROM credits cr
        WHERE cr.customer_id = c.id
          AND cr.location_id = c.location_id
          AND cr.status NOT IN ('SETTLED', 'REJECTED', 'CANCELLED')
      ), 0) as "openCreditAmount",

      (
        SELECT MAX(s.created_at)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.location_id = c.location_id
      ) as "lastSaleAt"

    FROM customers c
    LEFT JOIN locations l ON l.id = c.location_id
    WHERE
      ${locationId == null ? sql`TRUE` : sql`c.location_id = ${locationId}`}
      AND ${cursorId == null ? sql`TRUE` : sql`c.id < ${cursorId}`}
    ORDER BY c.id DESC
    LIMIT ${lim}
  `);

  const rows = res.rows || res || [];
  const nextCursor = rows.length === lim ? rows[rows.length - 1].id : null;

  return {
    customers: rows,
    nextCursor,
  };
}

module.exports = {
  createCustomer,
  searchCustomers,
  listCustomers,
};
