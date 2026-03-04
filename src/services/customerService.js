// backend/src/services/customerService.js

const { db } = require("../config/db");
const { customers } = require("../db/schema/customers.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

/**
 * Normalize phone so duplicates like "0788 123 456" vs "0788123456" don't create 2 customers.
 * Keep it simple (no country parsing).
 */
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

function isUniqueViolation(err) {
  // Postgres unique violation = 23505
  return err && (err.code === "23505" || err.sqlState === "23505");
}

async function createCustomer({ locationId, actorId, data }) {
  if (!locationId) throw new Error("Missing locationId");
  if (!actorId) throw new Error("Missing actorId");

  const phone = normPhone(data?.phone);
  const name = normName(data?.name);
  const tin = normTin(data?.tin);
  const address = normAddress(data?.address);

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

  // 1) Fast path: exists
  const existing = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.locationId, locationId), eq(customers.phone, phone)),
    );

  if (existing[0]) {
    const patch = {};
    if (name && existing[0].name !== name) patch.name = name;

    if (tin) patch.tin = tin;
    if (address) patch.address = address;

    if (data?.notes != null) patch.notes = String(data.notes).trim() || null;

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date();
      const [updated] = await db
        .update(customers)
        .set(patch)
        .where(eq(customers.id, existing[0].id))
        .returning();
      return updated || existing[0];
    }
  }

  // 2) Try insert (race-safe). If unique conflict happens, fetch existing.
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
        notes: data?.notes ? String(data.notes).trim().slice(0, 2000) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(auditLogs).values({
      locationId: user.locationId, // <-- add this
      userId: user.id,
      action: "CUSTOMER_CREATE",
      entity: "customer",
      entityId: customer.id,
      description: `Customer created: ${customer.name}`,
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

  // allow searching phone even if staff types spaces/dashes
  const qPhone = normPhone(qq);
  const phonePattern = qPhone ? `%${qPhone}%` : null;

  // For ranking:
  // 1) exact phone match (strongest)
  // 2) phone starts with query
  // 3) phone contains query
  // 4) name contains query
  //
  // Then newest first
  const res = await db.execute(sql`
    SELECT
      id,
      location_id as "locationId",
      name,
      phone,
        tin,
  address,
      created_at as "createdAt"
    FROM customers
    WHERE
      ${locationId == null ? sql`TRUE` : sql`location_id = ${locationId}`}
      AND (
        name ILIKE ${namePattern}
        ${phonePattern ? sql`OR phone ILIKE ${phonePattern}` : sql``}
      )
    ORDER BY
      ${
        qPhone
          ? sql`
              CASE
                WHEN phone = ${qPhone} THEN 0
                WHEN phone ILIKE ${qPhone + "%"} THEN 1
                WHEN phone ILIKE ${"%" + qPhone + "%"} THEN 2
                WHEN name ILIKE ${namePattern} THEN 3
                ELSE 4
              END
            `
          : sql`
              CASE
                WHEN name ILIKE ${namePattern} THEN 0
                ELSE 1
              END
            `
      },
      created_at DESC
    LIMIT 20
  `);

  return res.rows || res;
}

// ✅ NEW: list customers (for dropdowns / browsing)
// - staff: location-scoped
// - owner: can pass locationId or null for all
async function listCustomers({ locationId, limit = 50 }) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));

  const res = await db.execute(sql`
    SELECT id, location_id as "locationId", name, phone, created_at as "createdAt"
    FROM customers
    WHERE ${locationId == null ? sql`TRUE` : sql`location_id = ${locationId}`}
    ORDER BY created_at DESC
    LIMIT ${lim}
  `);

  return res.rows || res;
}

module.exports = { createCustomer, searchCustomers, listCustomers };
