const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function toInt(v, dflt = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || "";
}

function rowsOf(result) {
  return result?.rows || result || [];
}

async function listOwnerSupplierBills({
  locationId,
  supplierId,
  status,
  q,
  limit = 100,
  offset = 0,
} = {}) {
  const locId = toInt(locationId, null);
  const supId = toInt(supplierId, null);
  const st = cleanStr(status).toUpperCase();
  const query = cleanStr(q);
  const lim = Math.max(1, Math.min(200, toInt(limit, 100) || 100));
  const off = Math.max(0, toInt(offset, 0) || 0);
  const like = query ? `%${query}%` : null;

  const res = await db.execute(sql`
    SELECT
      sb.id,
      sb.location_id as "locationId",
      COALESCE(l.name, CONCAT('Branch #', sb.location_id::text)) as "locationName",
      COALESCE(l.code, '') as "locationCode",

      sb.supplier_id as "supplierId",
      COALESCE(s.name, 'Unknown supplier') as "supplierName",
      COALESCE(s.default_currency, sb.currency, 'RWF') as "supplierDefaultCurrency",

      COALESCE(sb.bill_no, sb.reference, '') as "billNo",
      COALESCE(sb.currency, 'RWF') as "currency",

      COALESCE(sb.total_amount, 0)::int as "totalAmount",
      COALESCE(sb.paid_amount, 0)::int as "paidAmount",

      GREATEST(
        COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
        0
      )::int as "balance",

      COALESCE(sb.status, 'OPEN') as "status",
      COALESCE(sb.issued_date, sb.bill_date) as "issuedDate",
      sb.due_date as "dueDate",
      COALESCE(sb.note, sb.notes, '') as "note",

      COALESCE(sb.created_by_user_id, sb.created_by) as "createdByUserId",
      COALESCE(u.name, u.email, CONCAT('User #', COALESCE(sb.created_by_user_id, sb.created_by)::text)) as "createdByName",

      sb.created_at as "createdAt",
      sb.updated_at as "updatedAt",

      CASE
        WHEN UPPER(COALESCE(sb.status, '')) IN ('PAID', 'VOID') THEN false
        WHEN sb.due_date IS NULL THEN false
        WHEN sb.due_date < CURRENT_DATE THEN true
        ELSE false
      END as "isOverdue",

      CASE
        WHEN UPPER(COALESCE(sb.status, '')) IN ('PAID', 'VOID') THEN 0
        WHEN sb.due_date IS NULL THEN 0
        WHEN sb.due_date < CURRENT_DATE THEN (CURRENT_DATE - sb.due_date)::int
        ELSE 0
      END as "daysOverdue"

    FROM supplier_bills sb
    LEFT JOIN suppliers s
      ON s.id = sb.supplier_id
    LEFT JOIN locations l
      ON l.id = sb.location_id
    LEFT JOIN users u
      ON u.id = COALESCE(sb.created_by_user_id, sb.created_by)

    WHERE 1=1
      ${locId ? sql`AND sb.location_id = ${locId}` : sql``}
      ${supId ? sql`AND sb.supplier_id = ${supId}` : sql``}
      ${st ? sql`AND UPPER(COALESCE(sb.status, '')) = ${st}` : sql``}
      ${
        like
          ? sql`AND (
              COALESCE(s.name, '') ILIKE ${like}
              OR COALESCE(sb.bill_no, '') ILIKE ${like}
              OR COALESCE(sb.reference, '') ILIKE ${like}
              OR COALESCE(sb.note, '') ILIKE ${like}
              OR COALESCE(sb.notes, '') ILIKE ${like}
              OR COALESCE(l.name, '') ILIKE ${like}
              OR COALESCE(l.code, '') ILIKE ${like}
            )`
          : sql``
      }

    ORDER BY sb.created_at DESC, sb.id DESC
    LIMIT ${lim}
    OFFSET ${off}
  `);

  return rowsOf(res);
}

async function getOwnerSupplierBillsSummary({
  locationId,
  supplierId,
  status,
  q,
} = {}) {
  const locId = toInt(locationId, null);
  const supId = toInt(supplierId, null);
  const st = cleanStr(status).toUpperCase();
  const query = cleanStr(q);
  const like = query ? `%${query}%` : null;

  const res = await db.execute(sql`
    SELECT
      COUNT(*)::int as "billsCount",

      COALESCE(SUM(COALESCE(sb.total_amount, 0)), 0)::int as "totalAmount",
      COALESCE(SUM(COALESCE(sb.paid_amount, 0)), 0)::int as "paidAmount",
      COALESCE(SUM(
        GREATEST(
          COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
          0
        )
      ), 0)::int as "balanceAmount",

      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(sb.status, '')) = 'PARTIALLY_PAID'
      )::int as "partiallyPaidCount",

      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(sb.status, '')) NOT IN ('PAID', 'VOID')
          AND sb.due_date IS NOT NULL
          AND sb.due_date < CURRENT_DATE
      )::int as "overdueBillsCount",

      COALESCE(SUM(
        CASE
          WHEN UPPER(COALESCE(sb.status, '')) NOT IN ('PAID', 'VOID')
            AND sb.due_date IS NOT NULL
            AND sb.due_date < CURRENT_DATE
          THEN GREATEST(
            COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
            0
          )
          ELSE 0
        END
      ), 0)::int as "overdueAmount",

      COALESCE(SUM(
        CASE WHEN UPPER(COALESCE(sb.currency, 'RWF')) = 'RWF'
        THEN GREATEST(
          COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
          0
        ) ELSE 0 END
      ), 0)::int as "balanceRWF",

      COALESCE(SUM(
        CASE WHEN UPPER(COALESCE(sb.currency, 'RWF')) = 'USD'
        THEN GREATEST(
          COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
          0
        ) ELSE 0 END
      ), 0)::int as "balanceUSD",

      COALESCE(SUM(
        CASE
          WHEN UPPER(COALESCE(sb.currency, 'RWF')) = 'RWF'
           AND UPPER(COALESCE(sb.status, '')) NOT IN ('PAID', 'VOID')
           AND sb.due_date IS NOT NULL
           AND sb.due_date < CURRENT_DATE
          THEN GREATEST(
            COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
            0
          )
          ELSE 0
        END
      ), 0)::int as "overdueRWF",

      COALESCE(SUM(
        CASE
          WHEN UPPER(COALESCE(sb.currency, 'RWF')) = 'USD'
           AND UPPER(COALESCE(sb.status, '')) NOT IN ('PAID', 'VOID')
           AND sb.due_date IS NOT NULL
           AND sb.due_date < CURRENT_DATE
          THEN GREATEST(
            COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
            0
          )
          ELSE 0
        END
      ), 0)::int as "overdueUSD"

    FROM supplier_bills sb
    LEFT JOIN suppliers s
      ON s.id = sb.supplier_id
    LEFT JOIN locations l
      ON l.id = sb.location_id

    WHERE 1=1
      ${locId ? sql`AND sb.location_id = ${locId}` : sql``}
      ${supId ? sql`AND sb.supplier_id = ${supId}` : sql``}
      ${st ? sql`AND UPPER(COALESCE(sb.status, '')) = ${st}` : sql``}
      ${
        like
          ? sql`AND (
              COALESCE(s.name, '') ILIKE ${like}
              OR COALESCE(sb.bill_no, '') ILIKE ${like}
              OR COALESCE(sb.reference, '') ILIKE ${like}
              OR COALESCE(sb.note, '') ILIKE ${like}
              OR COALESCE(sb.notes, '') ILIKE ${like}
              OR COALESCE(l.name, '') ILIKE ${like}
              OR COALESCE(l.code, '') ILIKE ${like}
            )`
          : sql``
      }
  `);

  return (
    rowsOf(res)[0] || {
      billsCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      balanceAmount: 0,
      partiallyPaidCount: 0,
      overdueBillsCount: 0,
      overdueAmount: 0,
      balanceRWF: 0,
      balanceUSD: 0,
      overdueRWF: 0,
      overdueUSD: 0,
    }
  );
}

async function getOwnerSupplierBillById(id) {
  const billId = toInt(id, null);
  if (!billId) return null;

  const billRes = await db.execute(sql`
    SELECT
      sb.id,
      sb.location_id as "locationId",
      COALESCE(l.name, CONCAT('Branch #', sb.location_id::text)) as "locationName",
      COALESCE(l.code, '') as "locationCode",

      sb.supplier_id as "supplierId",
      COALESCE(s.name, 'Unknown supplier') as "supplierName",
      COALESCE(s.default_currency, sb.currency, 'RWF') as "supplierDefaultCurrency",

      COALESCE(sb.bill_no, sb.reference, '') as "billNo",
      COALESCE(sb.currency, 'RWF') as "currency",

      COALESCE(sb.total_amount, 0)::int as "totalAmount",
      COALESCE(sb.paid_amount, 0)::int as "paidAmount",

      GREATEST(
        COALESCE(NULLIF(sb.balance_due, 0), sb.total_amount - sb.paid_amount, sb.total_amount, 0),
        0
      )::int as "balance",

      COALESCE(sb.status, 'OPEN') as "status",
      COALESCE(sb.issued_date, sb.bill_date) as "issuedDate",
      sb.due_date as "dueDate",
      COALESCE(sb.note, sb.notes, '') as "note",

      COALESCE(sb.created_by_user_id, sb.created_by) as "createdByUserId",
      COALESCE(u.name, u.email, CONCAT('User #', COALESCE(sb.created_by_user_id, sb.created_by)::text)) as "createdByName",

      sb.created_at as "createdAt",
      sb.updated_at as "updatedAt"
    FROM supplier_bills sb
    LEFT JOIN suppliers s
      ON s.id = sb.supplier_id
    LEFT JOIN locations l
      ON l.id = sb.location_id
    LEFT JOIN users u
      ON u.id = COALESCE(sb.created_by_user_id, sb.created_by)
    WHERE sb.id = ${billId}
    LIMIT 1
  `);

  const bill = rowsOf(billRes)[0];
  if (!bill) return null;

  const itemsRes = await db.execute(sql`
    SELECT
      i.id,
      i.bill_id as "billId",
      i.product_id as "productId",
      i.description,
      COALESCE(i.qty, 0)::int as "qty",
      COALESCE(i.unit_cost, 0)::int as "unitCost",
      COALESCE(i.line_total, 0)::int as "lineTotal",
      i.created_at as "createdAt"
    FROM supplier_bill_items i
    WHERE i.bill_id = ${billId}
    ORDER BY i.id ASC
  `);

  const paymentsRes = await db.execute(sql`
    SELECT
      p.id,
      p.bill_id as "billId",
      COALESCE(p.amount, 0)::int as "amount",
      p.method,
      p.reference,
      p.note,
      p.paid_at as "paidAt",
      p.created_by_user_id as "createdByUserId",
      COALESCE(u.name, u.email, CONCAT('User #', p.created_by_user_id::text)) as "createdByName",
      p.created_at as "createdAt"
    FROM supplier_bill_payments p
    LEFT JOIN users u
      ON u.id = p.created_by_user_id
    WHERE p.bill_id = ${billId}
    ORDER BY p.paid_at DESC, p.id DESC
  `);

  return {
    bill,
    items: rowsOf(itemsRes),
    payments: rowsOf(paymentsRes),
  };
}

module.exports = {
  listOwnerSupplierBills,
  getOwnerSupplierBillsSummary,
  getOwnerSupplierBillById,
};
