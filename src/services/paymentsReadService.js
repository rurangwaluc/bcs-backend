const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function rowsOf(result) {
  return result?.rows || result || [];
}

async function tryExecute(query) {
  return await db.execute(query);
}

function sqlInNumberList(values) {
  const clean = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v)),
    ),
  );

  if (clean.length === 0) return null;
  return sql.join(
    clean.map((v) => sql`${v}`),
    sql`, `,
  );
}

/**
 * Base payment normalization
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

  const recordedByUserId =
    r.recordedByUserId ??
    r.recorded_by_user_id ??
    r.recorded_by ??
    r.cashierId ??
    r.cashier_id ??
    r.userId ??
    r.user_id ??
    null;

  const createdAt =
    r.createdAt ?? r.created_at ?? r.created ?? r.created_on ?? null;

  const status = r.status ?? r.payment_status ?? null;
  const note = r.note ?? r.payment_note ?? null;

  return {
    id,
    saleId: saleId != null ? Number(saleId) : null,
    amount,
    method,
    recordedByUserId:
      recordedByUserId != null ? Number(recordedByUserId) : null,
    cashSessionId: cashSessionId != null ? Number(cashSessionId) : null,
    createdAt,
    status,
    note,
  };
}

function normalizeMethodKey(method) {
  const m = String(method || "")
    .trim()
    .toUpperCase();
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
    const v = Number(r?.total ?? r?.amount ?? 0);
    b[k] += v;
  }
  return b;
}

function normalizeSaleRow(r) {
  if (!r) return null;

  const id = r.id ?? r.ID ?? null;

  const customerName =
    r.customerName ?? r.customer_name ?? r.buyer_name ?? r.client_name ?? null;

  const customerPhone =
    r.customerPhone ??
    r.customer_phone ??
    r.buyer_phone ??
    r.client_phone ??
    null;

  return {
    id: id != null ? Number(id) : null,
    customerName: customerName ? String(customerName) : null,
    customerPhone: customerPhone ? String(customerPhone) : null,
  };
}

function normalizeSaleItemRow(r) {
  if (!r) return null;

  const id = r.id ?? null;
  const saleId = r.saleId ?? r.sale_id ?? null;
  const productId = r.productId ?? r.product_id ?? null;

  const qtyRaw =
    r.qty ?? r.quantity ?? r.qty_sold ?? r.qtySold ?? r.units ?? r.count ?? 0;

  const productName =
    r.productName ?? r.product_name ?? r.name ?? r.title ?? null;

  return {
    id: id != null ? Number(id) : null,
    saleId: saleId != null ? Number(saleId) : null,
    productId: productId != null ? Number(productId) : null,
    qty: Number(qtyRaw || 0),
    productName: productName ? String(productName) : null,
  };
}

function normalizeProductRow(r) {
  if (!r) return null;

  const id = r.id ?? null;
  const name = r.name ?? r.productName ?? r.product_name ?? r.title ?? null;

  return {
    id: id != null ? Number(id) : null,
    name: name ? String(name) : null,
  };
}

function normalizeUserRow(r) {
  if (!r) return null;

  const id = r.id ?? r.ID ?? null;
  const name =
    r.name ?? r.full_name ?? r.fullName ?? r.display_name ?? r.username ?? null;

  return {
    id: id != null ? Number(id) : null,
    name: name ? String(name) : null,
  };
}

async function listPaymentsBase({ locationId, limit = 100, offset = 0 }) {
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

async function fetchSalesByIds({ saleIds, locationId }) {
  const idsSql = sqlInNumberList(saleIds);
  if (!idsSql) return [];

  const qSnake = sql`
    select *
    from sales
    where location_id = ${locationId}
      and id in (${idsSql})
  `;

  const qCamel = sql`
    select *
    from sales
    where "locationId" = ${locationId}
      and id in (${idsSql})
  `;

  try {
    const rows = rowsOf(await tryExecute(qSnake));
    return rows.map(normalizeSaleRow).filter(Boolean);
  } catch (e1) {
    try {
      const rows2 = rowsOf(await tryExecute(qCamel));
      return rows2.map(normalizeSaleRow).filter(Boolean);
    } catch (e2) {
      const err = new Error("PAYMENTS_SALES_LOOKUP_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

async function fetchSaleItemsBySaleIds({ saleIds }) {
  const idsSql = sqlInNumberList(saleIds);
  if (!idsSql) return [];

  const qSnake = sql`
    select *
    from sale_items
    where sale_id in (${idsSql})
    order by sale_id asc, id asc
  `;

  const qCamel = sql`
    select *
    from sale_items
    where "saleId" in (${idsSql})
    order by "saleId" asc, id asc
  `;

  try {
    const rows = rowsOf(await tryExecute(qSnake));
    return rows.map(normalizeSaleItemRow).filter(Boolean);
  } catch (e1) {
    try {
      const rows2 = rowsOf(await tryExecute(qCamel));
      return rows2.map(normalizeSaleItemRow).filter(Boolean);
    } catch (e2) {
      const err = new Error("PAYMENTS_SALE_ITEMS_LOOKUP_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

async function fetchProductsByIds({ productIds }) {
  const idsSql = sqlInNumberList(productIds);
  if (!idsSql) return [];

  const qSnake = sql`
    select *
    from products
    where id in (${idsSql})
  `;

  const qCamel = sql`
    select *
    from products
    where id in (${idsSql})
  `;

  try {
    const rows = rowsOf(await tryExecute(qSnake));
    return rows.map(normalizeProductRow).filter(Boolean);
  } catch (e1) {
    try {
      const rows2 = rowsOf(await tryExecute(qCamel));
      return rows2.map(normalizeProductRow).filter(Boolean);
    } catch (e2) {
      const err = new Error("PAYMENTS_PRODUCTS_LOOKUP_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

async function fetchUsersByIds({ userIds }) {
  const idsSql = sqlInNumberList(userIds);
  if (!idsSql) return [];

  const qSnake = sql`
    select *
    from users
    where id in (${idsSql})
  `;

  const qCamel = sql`
    select *
    from users
    where id in (${idsSql})
  `;

  try {
    const rows = rowsOf(await tryExecute(qSnake));
    return rows.map(normalizeUserRow).filter(Boolean);
  } catch (e1) {
    try {
      const rows2 = rowsOf(await tryExecute(qCamel));
      return rows2.map(normalizeUserRow).filter(Boolean);
    } catch (e2) {
      const err = new Error("PAYMENTS_USERS_LOOKUP_FAILED");
      err.debug = { snakeError: e1?.message, camelError: e2?.message };
      throw err;
    }
  }
}

function buildSalePreviewMap({ saleItems, productMap }) {
  const grouped = new Map();

  for (const item of saleItems || []) {
    if (!item?.saleId) continue;
    if (!grouped.has(item.saleId)) grouped.set(item.saleId, []);
    grouped.get(item.saleId).push(item);
  }

  const previewMap = new Map();

  for (const [saleId, items] of grouped.entries()) {
    const first = items[0] || null;
    const itemCount = items.length;

    const resolvedTopItemName =
      first?.productName ||
      (first?.productId != null ? productMap.get(first.productId) : null) ||
      (first?.productId != null ? `Product #${first.productId}` : "—");

    previewMap.set(saleId, {
      topItemName: resolvedTopItemName,
      topItemQty: Number(first?.qty || 0),
      itemCount,
    });
  }

  return previewMap;
}

async function listPayments({ locationId, limit = 100, offset = 0 }) {
  const basePayments = await listPaymentsBase({ locationId, limit, offset });
  if (basePayments.length === 0) return [];

  const saleIds = basePayments
    .map((p) => p?.saleId)
    .filter((v) => Number.isFinite(Number(v)));

  const userIds = basePayments
    .map((p) => p?.recordedByUserId)
    .filter((v) => Number.isFinite(Number(v)));

  const [salesRows, saleItemsRows, userRows] = await Promise.all([
    fetchSalesByIds({ saleIds, locationId }),
    fetchSaleItemsBySaleIds({ saleIds }),
    fetchUsersByIds({ userIds }),
  ]);

  const productIds = saleItemsRows
    .map((x) => x?.productId)
    .filter((v) => Number.isFinite(Number(v)));

  const productRows = await fetchProductsByIds({ productIds });

  const salesMap = new Map();
  for (const s of salesRows) {
    if (s?.id != null) salesMap.set(s.id, s);
  }

  const usersMap = new Map();
  for (const u of userRows) {
    if (u?.id != null) usersMap.set(u.id, u.name || null);
  }

  const productMap = new Map();
  for (const p of productRows) {
    if (p?.id != null) productMap.set(p.id, p.name || null);
  }

  const salePreviewMap = buildSalePreviewMap({
    saleItems: saleItemsRows,
    productMap,
  });

  return basePayments.map((p) => {
    const sale = p?.saleId != null ? salesMap.get(Number(p.saleId)) : null;
    const cashierName =
      p?.recordedByUserId != null
        ? usersMap.get(Number(p.recordedByUserId)) || null
        : null;

    const salePreview =
      p?.saleId != null ? salePreviewMap.get(Number(p.saleId)) || null : null;

    return {
      ...p,
      customerName: sale?.customerName || null,
      customerPhone: sale?.customerPhone || null,
      cashierName,
      salePreview,
    };
  });
}

async function getPaymentsSummary({ locationId }) {
  const nowKigali = sql`(now() AT TIME ZONE 'Africa/Kigali')`;
  const todayStartKigali = sql`date_trunc('day', ${nowKigali})`;
  const yesterdayStartKigali = sql`${todayStartKigali} - interval '1 day'`;

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
    const y = rowsOf(await tryExecute(yesterdaySnake))[0] || {
      count: 0,
      total: 0,
    };
    const a = rowsOf(await tryExecute(allSnake))[0] || { count: 0, total: 0 };

    return {
      today: { count: Number(t.count || 0), total: Number(t.total || 0) },
      yesterday: { count: Number(y.count || 0), total: Number(y.total || 0) },
      allTime: { count: Number(a.count || 0), total: Number(a.total || 0) },
    };
  } catch (e1) {
    try {
      const t = rowsOf(await tryExecute(todayCamel))[0] || {
        count: 0,
        total: 0,
      };
      const y = rowsOf(await tryExecute(yesterdayCamel))[0] || {
        count: 0,
        total: 0,
      };
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
