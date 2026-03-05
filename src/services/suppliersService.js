const { and, desc, eq, ilike, or } = require("drizzle-orm");
const { db } = require("../config/db");
const { suppliers } = require("../db/schema/suppliers.schema");
const { supplierBills } = require("../db/schema/supplier_bills.schema");

function cleanStr(x) {
  const s = x == null ? "" : String(x).trim();
  return s || null;
}

async function listSuppliers({ q, limit = 50, offset = 0 } = {}) {
  const query = cleanStr(q);
  const where = query
    ? or(
        ilike(suppliers.name, `%${query}%`),
        ilike(suppliers.phone, `%${query}%`),
        ilike(suppliers.email, `%${query}%`),
        ilike(suppliers.country, `%${query}%`),
      )
    : undefined;

  const rows = await db
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(desc(suppliers.id))
    .limit(Number(limit) || 50)
    .offset(Number(offset) || 0);

  return rows || [];
}

async function getSupplierById(id) {
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, sid))
    .limit(1);
  return rows?.[0] || null;
}

async function createSupplier(payload) {
  const data = {
    name: String(payload.name).trim(),
    phone: cleanStr(payload.phone),
    email: cleanStr(payload.email),
    address: cleanStr(payload.address),
    origin: String(payload.origin || "LOCAL")
      .trim()
      .toUpperCase(),
    country: cleanStr(payload.country),
    city: cleanStr(payload.city),
    notes: cleanStr(payload.notes),
    isActive: payload.isActive !== false,
  };

  const rows = await db.insert(suppliers).values(data).returning();
  return rows?.[0] || null;
}

async function updateSupplier(id, payload) {
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  const patch = {};
  if (payload.name != null) patch.name = String(payload.name).trim();
  if (payload.phone !== undefined) patch.phone = cleanStr(payload.phone);
  if (payload.email !== undefined) patch.email = cleanStr(payload.email);
  if (payload.address !== undefined) patch.address = cleanStr(payload.address);
  if (payload.origin != null)
    patch.origin = String(payload.origin).trim().toUpperCase();
  if (payload.country !== undefined) patch.country = cleanStr(payload.country);
  if (payload.city !== undefined) patch.city = cleanStr(payload.city);
  if (payload.notes !== undefined) patch.notes = cleanStr(payload.notes);
  if (payload.isActive !== undefined) patch.isActive = !!payload.isActive;

  // updatedAt
  patch.updatedAt = new Date();

  const rows = await db
    .update(suppliers)
    .set(patch)
    .where(eq(suppliers.id, sid))
    .returning();
  return rows?.[0] || null;
}

/**
 * Supplier financial summary:
 * - openBillsCount
 * - totalBalanceDue
 */
async function getSupplierSummary(id) {
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  // Only OPEN or PARTIALLY_PAID count as outstanding
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.id, sid))
    .limit(1);

  const s = rows?.[0];
  if (!s) return null;

  const bills = await db
    .select({
      status: supplierBills.status,
      balanceDue: supplierBills.balanceDue,
    })
    .from(supplierBills)
    .where(eq(supplierBills.supplierId, sid));

  let openBillsCount = 0;
  let totalBalanceDue = 0;

  for (const b of bills || []) {
    const st = String(b?.status || "").toUpperCase();
    if (st === "OPEN" || st === "PARTIALLY_PAID") {
      openBillsCount += 1;
      totalBalanceDue += Number(b?.balanceDue || 0) || 0;
    }
  }

  return {
    supplier: s,
    openBillsCount,
    totalBalanceDue,
  };
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  getSupplierSummary,
};
