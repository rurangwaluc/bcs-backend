const { db } = require("../config/db");
const { suppliers } = require("../db/schema/suppliers.schema");
const { supplierBills } = require("../db/schema/supplierBills.schema");
const {
  supplierCreateSchema,
  supplierUpdateSchema,
} = require("../validators/suppliers.schema");
const { and, desc, eq, sql } = require("drizzle-orm");

function toInt(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function normalizeSourceType(v) {
  const s = String(v || "LOCAL")
    .trim()
    .toUpperCase();
  return s === "ABROAD" ? "ABROAD" : "LOCAL";
}

function normalizeCurrency(v, sourceType = "LOCAL") {
  const c = String(v || "")
    .trim()
    .toUpperCase();
  if (c === "USD" || c === "RWF") return c;
  return sourceType === "ABROAD" ? "USD" : "RWF";
}

async function listSuppliers(req, reply) {
  const q = String(req.query?.q || "").trim();
  const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
  const offset = Math.max(0, toInt(req.query?.offset, 0));
  const active = req.query?.active;
  const sourceType = String(req.query?.sourceType || "")
    .trim()
    .toUpperCase();

  const where = [];

  if (q) {
    const like = `%${q}%`;
    where.push(
      sql`(
        ${suppliers.name} ILIKE ${like}
        OR ${suppliers.phone} ILIKE ${like}
        OR ${suppliers.email} ILIKE ${like}
        OR ${suppliers.contactName} ILIKE ${like}
        OR ${suppliers.country} ILIKE ${like}
        OR ${suppliers.city} ILIKE ${like}
      )`,
    );
  }

  if (sourceType === "LOCAL" || sourceType === "ABROAD") {
    where.push(eq(suppliers.sourceType, sourceType));
  }

  if (String(active || "") === "true") where.push(eq(suppliers.isActive, true));
  if (String(active || "") === "false")
    where.push(eq(suppliers.isActive, false));

  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactName: suppliers.contactName,
      phone: suppliers.phone,
      email: suppliers.email,
      country: suppliers.country,
      city: suppliers.city,
      sourceType: suppliers.sourceType,
      defaultCurrency: suppliers.defaultCurrency,
      address: suppliers.address,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
    })
    .from(suppliers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(suppliers.id))
    .limit(limit)
    .offset(offset);

  return reply.send({ ok: true, suppliers: rows });
}

async function createSupplier(req, reply) {
  const parsed = supplierCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }

  const b = parsed.data;
  const sourceType = normalizeSourceType(b.sourceType);
  const defaultCurrency = normalizeCurrency(b.defaultCurrency, sourceType);

  const [row] = await db
    .insert(suppliers)
    .values({
      name: String(b.name).trim(),
      contactName: cleanStr(b.contactName),
      phone: cleanStr(b.phone),
      email: cleanStr(b.email),
      country: cleanStr(b.country),
      city: cleanStr(b.city),
      sourceType,
      defaultCurrency,
      address: cleanStr(b.address),
      notes: cleanStr(b.notes),
      isActive: b.isActive ?? true,
      updatedAt: sql`now()`,
    })
    .returning();

  return reply.status(201).send({ ok: true, supplier: row });
}

async function getSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid id" });
  }

  const [row] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactName: suppliers.contactName,
      phone: suppliers.phone,
      email: suppliers.email,
      country: suppliers.country,
      city: suppliers.city,
      sourceType: suppliers.sourceType,
      defaultCurrency: suppliers.defaultCurrency,
      address: suppliers.address,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
    })
    .from(suppliers)
    .where(eq(suppliers.id, id));

  if (!row) return reply.status(404).send({ error: "Supplier not found" });
  return reply.send({ ok: true, supplier: row });
}

async function updateSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid id" });
  }

  const parsed = supplierUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }

  const b = parsed.data;

  const existing = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);

  const current = existing[0];
  if (!current) return reply.status(404).send({ error: "Supplier not found" });

  const nextSourceType =
    b.sourceType !== undefined
      ? normalizeSourceType(b.sourceType)
      : current.sourceType;

  const patch = {
    ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
    ...(b.contactName !== undefined
      ? { contactName: cleanStr(b.contactName) }
      : {}),
    ...(b.phone !== undefined ? { phone: cleanStr(b.phone) } : {}),
    ...(b.email !== undefined ? { email: cleanStr(b.email) } : {}),
    ...(b.country !== undefined ? { country: cleanStr(b.country) } : {}),
    ...(b.city !== undefined ? { city: cleanStr(b.city) } : {}),
    ...(b.sourceType !== undefined ? { sourceType: nextSourceType } : {}),
    ...(b.defaultCurrency !== undefined
      ? {
          defaultCurrency: normalizeCurrency(b.defaultCurrency, nextSourceType),
        }
      : {}),
    ...(b.address !== undefined ? { address: cleanStr(b.address) } : {}),
    ...(b.notes !== undefined ? { notes: cleanStr(b.notes) } : {}),
    ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
    updatedAt: sql`now()`,
  };

  const [row] = await db
    .update(suppliers)
    .set(patch)
    .where(eq(suppliers.id, id))
    .returning();

  return reply.send({ ok: true, supplier: row });
}

async function deleteSupplier(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({ error: "Invalid id" });
  }

  const [row] = await db
    .update(suppliers)
    .set({
      isActive: false,
      updatedAt: sql`now()`,
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!row) return reply.status(404).send({ error: "Supplier not found" });
  return reply.send({ ok: true, supplier: row });
}

async function supplierSummary(req, reply) {
  const supplierId = req.query?.supplierId
    ? Number(req.query.supplierId)
    : null;

  const where = [sql`${supplierBills.status} <> 'VOID'`];
  if (supplierId && Number.isInteger(supplierId) && supplierId > 0) {
    where.push(eq(supplierBills.supplierId, supplierId));
  }

  const rows = await db
    .select({
      billsCount: sql`count(*)::int`.as("billsCount"),
      totalAmount: sql`coalesce(sum(${supplierBills.totalAmount}), 0)::int`.as(
        "totalAmount",
      ),
      paidAmount: sql`coalesce(sum(${supplierBills.paidAmount}), 0)::int`.as(
        "paidAmount",
      ),
    })
    .from(supplierBills)
    .where(and(...where));

  const r = rows?.[0] || { billsCount: 0, totalAmount: 0, paidAmount: 0 };
  const balance = Math.max(
    0,
    Number(r.totalAmount || 0) - Number(r.paidAmount || 0),
  );

  return reply.send({
    ok: true,
    summary: {
      billsCount: Number(r.billsCount || 0) || 0,
      totalAmount: Number(r.totalAmount || 0) || 0,
      paidAmount: Number(r.paidAmount || 0) || 0,
      balance,
    },
  });
}

module.exports = {
  listSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  supplierSummary,
};
