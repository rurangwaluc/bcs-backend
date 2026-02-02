// backend/src/services/paymentsReadService.js
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

async function tryExecute(query) {
  return await db.execute(query);
}

/**
 * We SELECT * to avoid hard-failing on column name mismatches.
 * Then we normalize the row into the API shape:
 * { id, saleId, amount, method, recordedByUserId, createdAt }
 *
 * This supports many possible DB column styles:
 * - snake_case: sale_id, recorded_by_user_id, created_at, payment_method
 * - camelCase: saleId, recordedByUserId, createdAt, paymentMethod
 */
function normalizePaymentRow(r) {
  if (!r) return null;

  const id = r.id ?? r.ID ?? null;

  const saleId =
    r.saleId ?? r.sale_id ?? r.saleID ?? r.sale ?? r.sale_id_fk ?? null;

  const amount = Number(r.amount ?? r.total ?? r.paid_amount ?? 0);

  const method =
    r.method ??
    r.payment_method ??
    r.paymentMethod ??
    r.pay_method ??
    r.type ??
    null;

  const recordedByUserId =
    r.recordedByUserId ??
    r.recorded_by_user_id ??
    r.recorded_by ??
    r.userId ??
    r.user_id ??
    null;

  const createdAt =
    r.createdAt ?? r.created_at ?? r.created ?? r.created_on ?? null;

  return { id, saleId, amount, method, recordedByUserId, createdAt };
}

async function listPayments({ locationId, limit = 100, offset = 0 }) {
  // Variant A: snake_case where + order
  const qSnake = sql`
    select *
    from payments
    where location_id = ${locationId}
    order by created_at desc
    limit ${limit}
    offset ${offset}
  `;

  // Variant B: camelCase where + order
  const qCamel = sql`
    select *
    from payments
    where "locationId" = ${locationId}
    order by "createdAt" desc
    limit ${limit}
    offset ${offset}
  `;

  try {
    const rows = rowsOf(await tryExecute(qSnake));
    return rows.map(normalizePaymentRow).filter(Boolean);
  } catch (e1) {
    try {
      const rows2 = rowsOf(await tryExecute(qCamel));
      return rows2.map(normalizePaymentRow).filter(Boolean);
    } catch (e2) {
      const err = new Error("PAYMENTS_LIST_QUERY_FAILED");
      err.debug = {
        snakeError: e1?.message,
        camelError: e2?.message,
      };
      throw err;
    }
  }
}

async function getPaymentsSummary({ locationId }) {
  // Keep your previous logic (works already)
  const todaySnake = sql`
    select
      count(*)::int as "count",
      coalesce(sum(amount), 0)::int as "total"
    from payments
    where location_id = ${locationId}
      and created_at >= date_trunc('day', now())
  `;

  const allSnake = sql`
    select
      count(*)::int as "count",
      coalesce(sum(amount), 0)::int as "total"
    from payments
    where location_id = ${locationId}
  `;

  const todayCamel = sql`
    select
      count(*)::int as "count",
      coalesce(sum(amount), 0)::int as "total"
    from payments
    where "locationId" = ${locationId}
      and "createdAt" >= date_trunc('day', now())
  `;

  const allCamel = sql`
    select
      count(*)::int as "count",
      coalesce(sum(amount), 0)::int as "total"
    from payments
    where "locationId" = ${locationId}
  `;

  try {
    const t = rowsOf(await tryExecute(todaySnake))[0] || { count: 0, total: 0 };
    const a = rowsOf(await tryExecute(allSnake))[0] || { count: 0, total: 0 };
    return {
      today: { count: Number(t.count || 0), total: Number(t.total || 0) },
      allTime: { count: Number(a.count || 0), total: Number(a.total || 0) },
    };
  } catch (e1) {
    try {
      const t = rowsOf(await tryExecute(todayCamel))[0] || {
        count: 0,
        total: 0,
      };
      const a = rowsOf(await tryExecute(allCamel))[0] || { count: 0, total: 0 };
      return {
        today: { count: Number(t.count || 0), total: Number(t.total || 0) },
        allTime: { count: Number(a.count || 0), total: Number(a.total || 0) },
      };
    } catch (e2) {
      const err = new Error("PAYMENTS_SUMMARY_QUERY_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

module.exports = { listPayments, getPaymentsSummary };
