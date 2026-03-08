const { desc, eq, ilike, or, and, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { suppliers } = require("../db/schema/suppliers.schema");
const { supplierBills } = require("../db/schema/supplierBills.schema");

function cleanStr(x) {
  const s = x == null ? "" : String(x).trim();
  return s || null;
}

function toInt(v, dflt = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

async function listSuppliers({
  q,
  limit = 50,
  offset = 0,
  active,
  sourceType,
} = {}) {
  const query = cleanStr(q);
  const where = [];

  if (query) {
    where.push(
      or(
        ilike(suppliers.name, `%${query}%`),
        ilike(suppliers.contactName, `%${query}%`),
        ilike(suppliers.phone, `%${query}%`),
        ilike(suppliers.email, `%${query}%`),
        ilike(suppliers.country, `%${query}%`),
        ilike(suppliers.city, `%${query}%`),
      ),
    );
  }

  if (active === true) where.push(eq(suppliers.isActive, true));
  if (active === false) where.push(eq(suppliers.isActive, false));

  if (cleanStr(sourceType)) {
    where.push(
      eq(suppliers.sourceType, String(sourceType).trim().toUpperCase()),
    );
  }

  const rows = await db
    .select()
    .from(suppliers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(suppliers.id))
    .limit(Math.max(1, Math.min(100, Number(limit) || 50)))
    .offset(Math.max(0, Number(offset) || 0));

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
    contactName: cleanStr(payload.contactName),
    phone: cleanStr(payload.phone),
    email: cleanStr(payload.email),
    country: cleanStr(payload.country),
    city: cleanStr(payload.city),
    sourceType: String(payload.sourceType || "LOCAL")
      .trim()
      .toUpperCase(),
    address: cleanStr(payload.address),
    notes: cleanStr(payload.notes),
    isActive: payload.isActive !== false,
    updatedAt: new Date(),
  };

  const rows = await db.insert(suppliers).values(data).returning();
  return rows?.[0] || null;
}

async function updateSupplier(id, payload) {
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  const patch = {};

  if (payload.name != null) patch.name = String(payload.name).trim();
  if (payload.contactName !== undefined)
    patch.contactName = cleanStr(payload.contactName);
  if (payload.phone !== undefined) patch.phone = cleanStr(payload.phone);
  if (payload.email !== undefined) patch.email = cleanStr(payload.email);
  if (payload.country !== undefined) patch.country = cleanStr(payload.country);
  if (payload.city !== undefined) patch.city = cleanStr(payload.city);
  if (payload.sourceType !== undefined) {
    patch.sourceType = String(payload.sourceType).trim().toUpperCase();
  }
  if (payload.address !== undefined) patch.address = cleanStr(payload.address);
  if (payload.notes !== undefined) patch.notes = cleanStr(payload.notes);
  if (payload.isActive !== undefined) patch.isActive = !!payload.isActive;

  patch.updatedAt = new Date();

  const rows = await db
    .update(suppliers)
    .set(patch)
    .where(eq(suppliers.id, sid))
    .returning();

  return rows?.[0] || null;
}

/**
 * Branch-scoped supplier summary
 * Uses current active supplier bill schema:
 * - totalAmount
 * - paidAmount
 * - status
 * No balanceDue column assumed.
 */
async function getSupplierSummary({ supplierId, locationId }) {
  const sid = Number(supplierId);
  const lid = Number(locationId);

  if (!Number.isInteger(sid) || sid <= 0) return null;
  if (!Number.isInteger(lid) || lid <= 0) return null;

  const supplierRows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      sourceType: suppliers.sourceType,
      isActive: suppliers.isActive,
    })
    .from(suppliers)
    .where(eq(suppliers.id, sid))
    .limit(1);

  const supplier = supplierRows?.[0] || null;
  if (!supplier) return null;

  const rows = await db
    .select({
      billsCount: sql`count(*)::int`.as("billsCount"),
      totalAmount: sql`coalesce(sum(${supplierBills.totalAmount}), 0)::int`.as(
        "totalAmount",
      ),
      paidAmount: sql`coalesce(sum(${supplierBills.paidAmount}), 0)::int`.as(
        "paidAmount",
      ),
      openBillsCount:
        sql`count(*) filter (where ${supplierBills.status} = 'OPEN')::int`.as(
          "openBillsCount",
        ),
      partiallyPaidCount:
        sql`count(*) filter (where ${supplierBills.status} = 'PARTIALLY_PAID')::int`.as(
          "partiallyPaidCount",
        ),
      paidBillsCount:
        sql`count(*) filter (where ${supplierBills.status} = 'PAID')::int`.as(
          "paidBillsCount",
        ),
      overdueBillsCount: sql`count(*) filter (
        where ${supplierBills.dueDate} is not null
          and ${supplierBills.dueDate} < CURRENT_DATE
          and ${supplierBills.status} not in ('PAID', 'VOID')
      )::int`.as("overdueBillsCount"),
      overdueAmount: sql`coalesce(sum(
        case
          when ${supplierBills.dueDate} is not null
           and ${supplierBills.dueDate} < CURRENT_DATE
           and ${supplierBills.status} not in ('PAID', 'VOID')
          then greatest(${supplierBills.totalAmount} - ${supplierBills.paidAmount}, 0)
          else 0
        end
      ), 0)::int`.as("overdueAmount"),
    })
    .from(supplierBills)
    .where(
      and(
        eq(supplierBills.supplierId, sid),
        eq(supplierBills.locationId, lid),
        sql`${supplierBills.status} <> 'VOID'`,
      ),
    );

  const r = rows?.[0] || {
    billsCount: 0,
    totalAmount: 0,
    paidAmount: 0,
    openBillsCount: 0,
    partiallyPaidCount: 0,
    paidBillsCount: 0,
    overdueBillsCount: 0,
    overdueAmount: 0,
  };

  const balance = Math.max(
    0,
    Number(r.totalAmount || 0) - Number(r.paidAmount || 0),
  );

  return {
    supplier,
    billsCount: Number(r.billsCount || 0),
    totalAmount: Number(r.totalAmount || 0),
    paidAmount: Number(r.paidAmount || 0),
    balance,
    openBillsCount: Number(r.openBillsCount || 0),
    partiallyPaidCount: Number(r.partiallyPaidCount || 0),
    paidBillsCount: Number(r.paidBillsCount || 0),
    overdueBillsCount: Number(r.overdueBillsCount || 0),
    overdueAmount: Number(r.overdueAmount || 0),
  };
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  getSupplierSummary,
};
