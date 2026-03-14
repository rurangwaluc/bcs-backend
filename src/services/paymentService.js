const { db } = require("../config/db");
const { payments } = require("../db/schema/payments.schema");
const { sales } = require("../db/schema/sales.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");
const { logAudit } = require("./auditService");

async function recordPayment({
  request,
  locationId,
  cashierId,
  saleId,
  amount,
  method,
  note,
  cashSessionId,
}) {
  const cleanMethod = String(method || "CASH").toUpperCase();

  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (!["AWAITING_PAYMENT_RECORD", "PENDING"].includes(String(sale.status))) {
      const err = new Error("Invalid sale status");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (Number(amount) !== Number(sale.totalAmount)) {
      const err = new Error("Amount mismatch");
      err.code = "BAD_AMOUNT";
      throw err;
    }

    let resolvedSessionId = cashSessionId ? Number(cashSessionId) : null;

    if (cleanMethod === "CASH") {
      if (!resolvedSessionId) {
        const auto = await tx.execute(sql`
          SELECT id
          FROM cash_sessions
          WHERE cashier_id = ${cashierId}
            AND location_id = ${locationId}
            AND status = 'OPEN'
          ORDER BY opened_at DESC
          LIMIT 1
        `);
        const autoRows = auto?.rows || auto || [];
        if (autoRows.length === 0) {
          const err = new Error("No open cash session");
          err.code = "NO_OPEN_SESSION";
          throw err;
        }
        resolvedSessionId = Number(autoRows[0].id);
      } else {
        const sessionCheck = await tx.execute(sql`
          SELECT id
          FROM cash_sessions
          WHERE id = ${resolvedSessionId}
            AND cashier_id = ${cashierId}
            AND location_id = ${locationId}
            AND status = 'OPEN'
          LIMIT 1
        `);
        const rows = sessionCheck?.rows || sessionCheck || [];
        if (rows.length === 0) {
          const err = new Error("No open cash session");
          err.code = "NO_OPEN_SESSION";
          throw err;
        }
      }
    } else {
      resolvedSessionId = resolvedSessionId || null;
    }

    try {
      await tx.insert(payments).values({
        locationId,
        saleId,
        cashierId,
        cashSessionId: resolvedSessionId,
        amount,
        method: cleanMethod,
        note: note || null,
      });
    } catch (e) {
      if (e && e.code === "23505") {
        const err = new Error("Duplicate payment");
        err.code = "DUPLICATE_PAYMENT";
        throw err;
      }
      throw e;
    }

    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      cashSessionId: resolvedSessionId,
      type: "SALE_PAYMENT",
      direction: "IN",
      amount,
      method: cleanMethod,
      saleId,
      note: "Sale payment recorded",
    });

    const [updatedSale] = await tx
      .update(sales)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    await logAudit({
      request,
      locationId,
      userId: cashierId,
      action: "PAYMENT_RECORD",
      entity: "sale",
      entityId: saleId,
      description: `Payment recorded for sale #${saleId}`,
      meta: {
        saleId: Number(saleId),
        amount: Number(amount || 0),
        method: cleanMethod,
        cashSessionId: resolvedSessionId,
        note: note || null,
      },
    });

    return updatedSale;
  });
}

module.exports = { recordPayment };
