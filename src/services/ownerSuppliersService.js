"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function parseDateStart(v) {
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEndExclusive(v) {
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function buildFilters({
  supplierId,
  locationId,
  q,
  sourceType,
  active,
  status,
  dateFrom,
  dateTo,
}) {
  return {
    supplierId: toInt(supplierId, null),
    locationId: toInt(locationId, null),
    q: cleanStr(q),
    sourceType: cleanStr(sourceType)?.toUpperCase() || null,
    active:
      active === true || active === false
        ? active
        : String(active || "") === "true"
          ? true
          : String(active || "") === "false"
            ? false
            : null,
    status: cleanStr(status)?.toUpperCase() || null,
    dateFromTs: parseDateStart(dateFrom),
    dateToExclusive: parseDateEndExclusive(dateTo),
  };
}

async function getOwnerSuppliersSummary(rawFilters = {}) {
  const filters = buildFilters(rawFilters);

  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int as "suppliersCount",

      COUNT(*) FILTER (
        WHERE s.is_active = true
      )::int as "activeSuppliersCount",

      COUNT(*) FILTER (
        WHERE COALESCE(UPPER(s.source_type), 'LOCAL') = 'LOCAL'
      )::int as "localSuppliersCount",

      COUNT(*) FILTER (
        WHERE COALESCE(UPPER(s.source_type), 'LOCAL') = 'ABROAD'
      )::int as "abroadSuppliersCount",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "billsCount",

      COALESCE((
        SELECT SUM(sb.total_amount)::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalBilled",

      COALESCE((
        SELECT SUM(sb.paid_amount)::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalPaid",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalOutstanding",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueBillsCount",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE 1 = 1
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueAmount"

    FROM suppliers s
    WHERE 1 = 1
      ${
        filters.q
          ? sql`AND (
              s.name ILIKE ${`%${filters.q}%`}
              OR s.contact_name ILIKE ${`%${filters.q}%`}
              OR s.phone ILIKE ${`%${filters.q}%`}
              OR s.email ILIKE ${`%${filters.q}%`}
              OR s.country ILIKE ${`%${filters.q}%`}
              OR s.city ILIKE ${`%${filters.q}%`}
            )`
          : sql``
      }
      ${filters.sourceType ? sql`AND UPPER(s.source_type) = ${filters.sourceType}` : sql``}
      ${filters.active === true ? sql`AND s.is_active = true` : sql``}
      ${filters.active === false ? sql`AND s.is_active = false` : sql``}
  `);

  return (
    rowsOf(rows)[0] || {
      suppliersCount: 0,
      activeSuppliersCount: 0,
      localSuppliersCount: 0,
      abroadSuppliersCount: 0,
      billsCount: 0,
      totalBilled: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueBillsCount: 0,
      overdueAmount: 0,
    }
  );
}

async function listOwnerSuppliers(rawFilters = {}) {
  const filters = buildFilters(rawFilters);
  const limit = Math.max(1, Math.min(100, toInt(rawFilters.limit, 50)));
  const offset = Math.max(0, toInt(rawFilters.offset, 0));

  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.name,
      s.contact_name as "contactName",
      s.phone,
      s.email,
      s.country,
      s.city,
      s.source_type as "sourceType",
      s.default_currency as "defaultCurrency",
      s.address,
      s.notes,
      s.is_active as "isActive",
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "billsCount",

      COALESCE((
        SELECT SUM(sb.total_amount)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalBilled",

      COALESCE((
        SELECT SUM(sb.paid_amount)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalPaid",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          ${filters.status ? sql`AND UPPER(sb.status) = ${filters.status}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "balanceDue",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueBillsCount",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueAmount",

      (
        SELECT MAX(sb.issued_date)
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status <> 'VOID'
      ) as "lastBillDate",

      (
        SELECT MAX(sbp.paid_at)
        FROM supplier_bill_payments sbp
        JOIN supplier_bills sb ON sb.id = sbp.bill_id
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status <> 'VOID'
      ) as "lastPaymentDate"

    FROM suppliers s
    WHERE 1 = 1
      ${
        filters.q
          ? sql`AND (
              s.name ILIKE ${`%${filters.q}%`}
              OR s.contact_name ILIKE ${`%${filters.q}%`}
              OR s.phone ILIKE ${`%${filters.q}%`}
              OR s.email ILIKE ${`%${filters.q}%`}
              OR s.country ILIKE ${`%${filters.q}%`}
              OR s.city ILIKE ${`%${filters.q}%`}
            )`
          : sql``
      }
      ${filters.sourceType ? sql`AND UPPER(s.source_type) = ${filters.sourceType}` : sql``}
      ${filters.active === true ? sql`AND s.is_active = true` : sql``}
      ${filters.active === false ? sql`AND s.is_active = false` : sql``}
    ORDER BY s.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rowsOf(rows);
}

async function getOwnerSupplierById({ id, locationId, dateFrom, dateTo }) {
  const filters = buildFilters({ locationId, dateFrom, dateTo });
  const supplierId = toInt(id, null);
  if (!supplierId) return null;

  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.name,
      s.contact_name as "contactName",
      s.phone,
      s.email,
      s.country,
      s.city,
      s.source_type as "sourceType",
      s.default_currency as "defaultCurrency",
      s.address,
      s.notes,
      s.is_active as "isActive",
      s.created_at as "createdAt",
      s.updated_at as "updatedAt",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "billsCount",

      COALESCE((
        SELECT SUM(sb.total_amount)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalBilled",

      COALESCE((
        SELECT SUM(sb.paid_amount)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "totalPaid",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          ${filters.dateFromTs ? sql`AND sb.created_at >= ${filters.dateFromTs}` : sql``}
          ${filters.dateToExclusive ? sql`AND sb.created_at < ${filters.dateToExclusive}` : sql``}
          AND sb.status <> 'VOID'
      ), 0) as "balanceDue",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status = 'OPEN'
      ), 0) as "openBillsCount",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status = 'PARTIALLY_PAID'
      ), 0) as "partiallyPaidCount",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status = 'PAID'
      ), 0) as "paidBillsCount",

      COALESCE((
        SELECT COUNT(*)::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueBillsCount",

      COALESCE((
        SELECT SUM(GREATEST(sb.total_amount - sb.paid_amount, 0))::int
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      ), 0) as "overdueAmount",

      (
        SELECT MAX(sb.issued_date)
        FROM supplier_bills sb
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status <> 'VOID'
      ) as "lastBillDate",

      (
        SELECT MAX(sbp.paid_at)
        FROM supplier_bill_payments sbp
        JOIN supplier_bills sb ON sb.id = sbp.bill_id
        WHERE sb.supplier_id = s.id
          ${filters.locationId ? sql`AND sb.location_id = ${filters.locationId}` : sql``}
          AND sb.status <> 'VOID'
      ) as "lastPaymentDate"

    FROM suppliers s
    WHERE s.id = ${supplierId}
    LIMIT 1
  `);

  return rowsOf(rows)[0] || null;
}
module.exports = {
  getOwnerSuppliersSummary,
  listOwnerSuppliers,
  getOwnerSupplierById,
};
