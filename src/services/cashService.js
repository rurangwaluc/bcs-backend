const { db } = require("../config/db");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { sql } = require("drizzle-orm");
const { logAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

function txMeta(type, direction, amount, method, note) {
  return { type, direction, amount, method, note };
}

async function createCashTx({ locationId, cashierId, type, amount, method, note }) {
  // map type -> direction
  const direction =
    type === "PETTY_CASH_OUT" || type === "VERSEMENT"
      ? "OUT"
      : "IN";

  const m = method || (type === "VERSEMENT" ? "BANK" : "CASH");

  const [row] = await db.insert(cashLedger).values({
    locationId,
    cashierId,
    type,
    direction,
    amount,
    method: m,
    note: note || null
  }).returning();

  // audit
  await logAudit({
    userId: cashierId,
    action:
      type === "VERSEMENT" ? AUDIT.VERSEMENT :
      direction === "IN" ? AUDIT.CASH_IN : AUDIT.CASH_OUT,
    entity: "cash_ledger",
    entityId: row.id,
    description: `Cash transaction recorded: ${type} ${direction} ${amount}`,
    meta: txMeta(type, direction, amount, m, note)
  });

  return row;
}

async function listLedger({ locationId, limit = 100 }) {
  const res = await db.execute(sql`
    SELECT id,
           location_id as "locationId",
           cashier_id as "cashierId",
           type,
           direction,
           amount,
           method,
           sale_id as "saleId",
           payment_id as "paymentId",
           note,
           created_at as "createdAt"
    FROM cash_ledger
    WHERE location_id = ${locationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  return res.rows || res;
}

async function summaryToday({ locationId }) {
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(now); end.setHours(23,59,59,999);

  const res = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0)::int as "cashIn",
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0)::int as "cashOut",
      COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0)::int
        - COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0)::int as "net"
    FROM cash_ledger
    WHERE location_id = ${locationId}
      AND created_at >= ${start}
      AND created_at <= ${end}
  `);

  return (res.rows || res)[0];
}

module.exports = { createCashTx, listLedger, summaryToday };
