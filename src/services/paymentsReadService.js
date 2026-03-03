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
 * { id, saleId, amount, method, recordedByUserId, cashSessionId, createdAt }
 */
function normalizePaymentRow(r) {
  if (!r) return null;

  const id = r.id ?? r.ID ?? null;

  const saleId =
    r.saleId ?? r.sale_id ?? r.saleID ?? r.sale ?? r.sale_id_fk ?? null;

  const cashSessionId =
    r.cashSessionId ?? r.cash_session_id ?? r.cash_session ?? null;

  const amount = Number(r.amount ?? r.total ?? r.paid_amount ?? 0);

  const method =
    r.method ??
    r.payment_method ??
    r.paymentMethod ??
    r.pay_method ??
    r.type ??
    null;

  // ✅ IMPORTANT FIX: support cashier_id (your DB)
  const recordedByUserId =
    r.recordedByUserId ??
    r.recorded_by_user_id ??
    r.recorded_by ??
    r.cashierId ??
    r.cashier_id ??
    r.userId ??
    r.user_id ??
    null;

  const createdAt = r.createdAt ?? r.created_at ?? r.created ?? r.created_on ?? null;

  return { id, saleId, amount, method, recordedByUserId, cashSessionId, createdAt };
}

function normalizeMethodKey(method) {
  const m = String(method || "").trim().toUpperCase();
  if (m === "CASH") return "CASH";
  if (m === "MOMO") return "MOMO";
  if (m === "BANK") return "BANK";
  if (m === "CARD") return "CARD";
  return "OTHER";
}

function emptyBucket() {
  return { CASH: 0, MOMO: 0, BANK: 0, CARD: 0, OTHER: 0 };
}

function bucketFromRows(rows) {
  const b = emptyBucket();
  for (const r of rows || []) {
    const k = normalizeMethodKey(r?.method);
    // ✅ support both shapes: breakdown rows use "total", payment rows use "amount"
    const v = Number(r?.total ?? r?.amount ?? 0);
    b[k] += v;
  }
  return b;
}

async function listPayments({ locationId, limit = 100, offset = 0 }) {
  const qSnake = sql`
    select *
    from payments
    where location_id = ${locationId}
    order by created_at desc
    limit ${limit}
    offset ${offset}
  `;

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
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

async function getPaymentsSummary({ locationId }) {
  const nowKigali = sql`(now() AT TIME ZONE 'Africa/Kigali')`;
  const todayStartKigali = sql`date_trunc('day', ${nowKigali})`;
  const yesterdayStartKigali = sql`${todayStartKigali} - interval '1 day'`;

  // snake_case
  const todaySnake = sql`
    select count(*)::int as "count", coalesce(sum(amount), 0)::bigint as "total"
    from payments
    where location_id = ${locationId}
      and (created_at AT TIME ZONE 'Africa/Kigali') >= ${todayStartKigali}
  `;

  const yesterdaySnake = sql`
    select count(*)::int as "count", coalesce(sum(amount), 0)::bigint as "total"
    from payments
    where location_id = ${locationId}
      and (created_at AT TIME ZONE 'Africa/Kigali') >= ${yesterdayStartKigali}
      and (created_at AT TIME ZONE 'Africa/Kigali') < ${todayStartKigali}
  `;

  const allSnake = sql`
    select count(*)::int as "count", coalesce(sum(amount), 0)::bigint as "total"
    from payments
    where location_id = ${locationId}
  `;

  // camelCase fallback
  const todayCamel = sql`
    select count(*)::int as "count", coalesce(sum("amount"), 0)::bigint as "total"
    from payments
    where "locationId" = ${locationId}
      and ("createdAt" AT TIME ZONE 'Africa/Kigali') >= ${todayStartKigali}
  `;

  const yesterdayCamel = sql`
    select count(*)::int as "count", coalesce(sum("amount"), 0)::bigint as "total"
    from payments
    where "locationId" = ${locationId}
      and ("createdAt" AT TIME ZONE 'Africa/Kigali') >= ${yesterdayStartKigali}
      and ("createdAt" AT TIME ZONE 'Africa/Kigali') < ${todayStartKigali}
  `;

  const allCamel = sql`
    select count(*)::int as "count", coalesce(sum("amount"), 0)::bigint as "total"
    from payments
    where "locationId" = ${locationId}
  `;

  try {
    const t = rowsOf(await tryExecute(todaySnake))[0] || { count: 0, total: 0 };
    const y = rowsOf(await tryExecute(yesterdaySnake))[0] || { count: 0, total: 0 };
    const a = rowsOf(await tryExecute(allSnake))[0] || { count: 0, total: 0 };

    return {
      today: { count: Number(t.count || 0), total: Number(t.total || 0) },
      yesterday: { count: Number(y.count || 0), total: Number(y.total || 0) },
      allTime: { count: Number(a.count || 0), total: Number(a.total || 0) },
    };
  } catch (e1) {
    try {
      const t = rowsOf(await tryExecute(todayCamel))[0] || { count: 0, total: 0 };
      const y = rowsOf(await tryExecute(yesterdayCamel))[0] || { count: 0, total: 0 };
      const a = rowsOf(await tryExecute(allCamel))[0] || { count: 0, total: 0 };

      return {
        today: { count: Number(t.count || 0), total: Number(t.total || 0) },
        yesterday: { count: Number(y.count || 0), total: Number(y.total || 0) },
        allTime: { count: Number(a.count || 0), total: Number(a.total || 0) },
      };
    } catch (e2) {
      const err = new Error("PAYMENTS_SUMMARY_QUERY_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

async function _breakdownSnake({ locationId, window }) {
  const nowKigali = sql`(now() AT TIME ZONE 'Africa/Kigali')`;
  const todayStartKigali = sql`date_trunc('day', ${nowKigali})`;
  const yesterdayStartKigali = sql`${todayStartKigali} - interval '1 day'`;

  let where = sql`where location_id = ${locationId}`;

  if (window === "today") {
    where = sql`${where} and (created_at AT TIME ZONE 'Africa/Kigali') >= ${todayStartKigali}`;
  } else if (window === "yesterday") {
    where = sql`${where} and (created_at AT TIME ZONE 'Africa/Kigali') >= ${yesterdayStartKigali}
                 and (created_at AT TIME ZONE 'Africa/Kigali') < ${todayStartKigali}`;
  }

  const q1 = sql`
    select upper(coalesce(method::text, 'UNKNOWN')) as "method",
           count(*)::int as "count",
           coalesce(sum(amount), 0)::bigint as "total"
    from payments
    ${where}
    group by 1
    order by "total" desc
  `;

  const q2 = sql`
    select upper(coalesce(payment_method::text, 'UNKNOWN')) as "method",
           count(*)::int as "count",
           coalesce(sum(amount), 0)::bigint as "total"
    from payments
    ${where}
    group by 1
    order by "total" desc
  `;

  try {
    return rowsOf(await tryExecute(q1));
  } catch {
    return rowsOf(await tryExecute(q2));
  }
}

async function _breakdownCamel({ locationId, window }) {
  const nowKigali = sql`(now() AT TIME ZONE 'Africa/Kigali')`;
  const todayStartKigali = sql`date_trunc('day', ${nowKigali})`;
  const yesterdayStartKigali = sql`${todayStartKigali} - interval '1 day'`;

  let where = sql`where "locationId" = ${locationId}`;

  if (window === "today") {
    where = sql`${where} and ("createdAt" AT TIME ZONE 'Africa/Kigali') >= ${todayStartKigali}`;
  } else if (window === "yesterday") {
    where = sql`${where} and ("createdAt" AT TIME ZONE 'Africa/Kigali') >= ${yesterdayStartKigali}
                 and ("createdAt" AT TIME ZONE 'Africa/Kigali') < ${todayStartKigali}`;
  }

  const q1 = sql`
    select upper(coalesce("method"::text, 'UNKNOWN')) as "method",
           count(*)::int as "count",
           coalesce(sum("amount"), 0)::bigint as "total"
    from payments
    ${where}
    group by 1
    order by "total" desc
  `;

  const q2 = sql`
    select upper(coalesce("paymentMethod"::text, 'UNKNOWN')) as "method",
           count(*)::int as "count",
           coalesce(sum("amount"), 0)::bigint as "total"
    from payments
    ${where}
    group by 1
    order by "total" desc
  `;

  try {
    return rowsOf(await tryExecute(q1));
  } catch {
    return rowsOf(await tryExecute(q2));
  }
}

async function getPaymentsBreakdown({ locationId }) {
  async function run(window) {
    try {
      const rows = await _breakdownSnake({ locationId, window });
      return rows.map((r) => ({
        method: r?.method ?? "UNKNOWN",
        count: Number(r?.count ?? 0),
        total: Number(r?.total ?? 0),
      }));
    } catch (e1) {
      try {
        const rows = await _breakdownCamel({ locationId, window });
        return rows.map((r) => ({
          method: r?.method ?? "UNKNOWN",
          count: Number(r?.count ?? 0),
          total: Number(r?.total ?? 0),
        }));
      } catch (e2) {
        const err = new Error("PAYMENTS_BREAKDOWN_QUERY_FAILED");
        err.debug = { snakeError: e1?.message, camelError: e2?.message };
        throw err;
      }
    }
  }

  const [todayRows, yesterdayRows, allTimeRows] = await Promise.all([
    run("today"),
    run("yesterday"),
    run("all"),
  ]);

  return {
    today: todayRows,
    yesterday: yesterdayRows,
    allTime: allTimeRows,
    todayBucket: bucketFromRows(todayRows),
    yesterdayBucket: bucketFromRows(yesterdayRows),
    allTimeBucket: bucketFromRows(allTimeRows),
  };
}

module.exports = { listPayments, getPaymentsSummary, getPaymentsBreakdown };