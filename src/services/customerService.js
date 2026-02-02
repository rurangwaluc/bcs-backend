const { db } = require("../config/db");
const { customers } = require("../db/schema/customers.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

async function createCustomer({ locationId, actorId, data }) {
  const existing = await db.select().from(customers).where(
    and(eq(customers.locationId, locationId), eq(customers.phone, data.phone))
  );

  if (existing[0]) return existing[0];

  const [created] = await db.insert(customers).values({
    locationId,
    name: data.name,
    phone: data.phone,
    notes: data.notes || null
  }).returning();

  await db.insert(auditLogs).values({
    userId: actorId,
    action: "CUSTOMER_CREATE",
    entity: "customer",
    entityId: created.id,
    description: `Customer created: ${created.name} (${created.phone})`
  });

  return created;
}

async function searchCustomers({ locationId, q }) {
  const pattern = `%${q}%`;

  const res = await db.execute(sql`
    SELECT id, name, phone, created_at as "createdAt"
    FROM customers
    WHERE location_id = ${locationId}
      AND (
        name ILIKE ${pattern}
        OR phone ILIKE ${pattern}
      )
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return res.rows || res;
}

module.exports = { createCustomer, searchCustomers };
