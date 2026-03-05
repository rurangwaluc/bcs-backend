const { db } = require("../config/db");
const { suppliers } = require("../db/schema/suppliers.schema");
const {
  supplierCreateSchema,
  supplierUpdateSchema,
} = require("../validators/suppliers.schema");
const { and, desc, eq, sql } = require("drizzle-orm");

function toInt(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

async function listSuppliers(req, reply) {
  const q = String(req.query?.q || "").trim();
  const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
  const offset = Math.max(0, toInt(req.query?.offset, 0));
  const active = req.query?.active;

  const where = [];
  if (q) {
    const like = `%${q}%`;
    where.push(
      sql`(
        ${suppliers.name} ILIKE ${like}
        OR ${suppliers.phone} ILIKE ${like}
        OR ${suppliers.email} ILIKE ${like}
        OR ${suppliers.contactName} ILIKE ${like}
      )`,
    );
  }
  if (String(active || "") === "true") where.push(eq(suppliers.isActive, true));
  if (String(active || "") === "false")
    where.push(eq(suppliers.isActive, false));

  const rows = await db
    .select()
    .from(suppliers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(suppliers.id))
    .limit(limit)
    .offset(offset);

  return reply.send({ suppliers: rows, limit, offset });
}

async function createSupplier(req, reply) {
  const parsed = supplierCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }

  const b = parsed.data;

  const [row] = await db
    .insert(suppliers)
    .values({
      name: b.name,
      contactName: b.contactName,
      phone: b.phone,
      email: b.email,
      country: b.country,
      city: b.city,
      sourceType: b.sourceType || "LOCAL",
      address: b.address,
      notes: b.notes,
      isActive: b.isActive ?? true,
      updatedAt: sql`now()`,
    })
    .returning();

  return reply.status(201).send({ supplier: row });
}

async function getSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!row) return reply.status(404).send({ error: "Supplier not found" });
  return reply.send({ supplier: row });
}

async function updateSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  const parsed = supplierUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }

  const b = parsed.data;

  const [row] = await db
    .update(suppliers)
    .set({
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.contactName !== undefined ? { contactName: b.contactName } : {}),
      ...(b.phone !== undefined ? { phone: b.phone } : {}),
      ...(b.email !== undefined ? { email: b.email } : {}),
      ...(b.country !== undefined ? { country: b.country } : {}),
      ...(b.city !== undefined ? { city: b.city } : {}),
      ...(b.sourceType !== undefined ? { sourceType: b.sourceType } : {}),
      ...(b.address !== undefined ? { address: b.address } : {}),
      ...(b.notes !== undefined ? { notes: b.notes } : {}),
      ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!row) return reply.status(404).send({ error: "Supplier not found" });
  return reply.send({ supplier: row });
}

async function deleteSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  // Soft delete: keep history
  const [row] = await db
    .update(suppliers)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(eq(suppliers.id, id))
    .returning();

  if (!row) return reply.status(404).send({ error: "Supplier not found" });
  return reply.send({ ok: true });
}

module.exports = {
  listSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
};
