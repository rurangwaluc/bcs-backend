const { db } = require("../config/db");
const { payments } = require("../db/schema/payments.schema");
const { sales } = require("../db/schema/sales.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

async function recordPayment({
  locationId,
  cashierId,
  saleId,
  amount,
  method,
  note,
  cashSessionId,
}) {
  return db.transaction(async (tx) => {
    // 1️⃣ Load sale
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // 2️⃣ Status check
    if (!["AWAITING_PAYMENT_RECORD", "PENDING"].includes(sale.status)) {
      const err = new Error("Invalid sale status");
      err.code = "BAD_STATUS";
      throw err;
    }

    // 3️⃣ Amount check
    if (amount !== sale.totalAmount) {
      const err = new Error("Amount mismatch");
      err.code = "BAD_AMOUNT";
      throw err;
    }

    // 4️⃣ Validate OPEN cash session
    const sessionCheck = await tx.execute(sql`
      SELECT id FROM cash_sessions
      WHERE id = ${cashSessionId}
        AND cashier_id = ${cashierId}
        AND location_id = ${locationId}
        AND status = 'OPEN'
      LIMIT 1
    `);

    const rows = sessionCheck.rows || sessionCheck;
    if (rows.length === 0) {
      const err = new Error("No open cash session");
      err.code = "NO_OPEN_SESSION";
      throw err;
    }

    // 5️⃣ Prevent double payment
    const existing = await tx.execute(sql`
      SELECT id FROM payments WHERE sale_id = ${saleId} LIMIT 1
    `);

    if ((existing.rows || existing).length > 0) {
      const err = new Error("Duplicate payment");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    // 6️⃣ Insert payment (✅ LINKED TO SESSION)
    await tx.insert(payments).values({
      locationId,
      saleId,
      cashierId,
      amount,
      method: method || "CASH",
      note: note || null,
      cashSessionId,
    });

    // 7️⃣ Cash ledger
    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      type: "SALE_PAYMENT",
      direction: "IN",
      amount,
      method: method || "CASH",
      saleId,
      note: "Sale payment recorded",
    });

    // 8️⃣ Complete sale
    const [updatedSale] = await tx
      .update(sales)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    // 9️⃣ Audit log
    await tx.insert(auditLogs).values({
      userId: cashierId,
      action: "PAYMENT_RECORD",
      entity: "sale",
      entityId: saleId,
      description: `Payment recorded for sale #${saleId}`,
    });

    return updatedSale;
  });
}

module.exports = { recordPayment };
