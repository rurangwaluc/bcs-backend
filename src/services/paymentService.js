// backend/src/services/paymentService.js
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
  const cleanMethod = String(method || "CASH").toUpperCase();

  return db.transaction(async (tx) => {
    // 1) Load sale
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // 2) Status check
    if (!["AWAITING_PAYMENT_RECORD", "PENDING"].includes(sale.status)) {
      const err = new Error("Invalid sale status");
      err.code = "BAD_STATUS";
      throw err;
    }

    // 3) Amount check (strict)
    if (Number(amount) !== Number(sale.totalAmount)) {
      const err = new Error("Amount mismatch");
      err.code = "BAD_AMOUNT";
      throw err;
    }

    // 4) Validate OPEN cash session
    const sessionCheck = await tx.execute(sql`
      SELECT id FROM cash_sessions
      WHERE id = ${cashSessionId}
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

    // 5) Prevent double payment
    const existing = await tx.execute(sql`
      SELECT id FROM payments WHERE sale_id = ${saleId} LIMIT 1
    `);
    const existingRows = existing?.rows || existing || [];
    if (existingRows.length > 0) {
      const err = new Error("Duplicate payment");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    // 6) Insert payment (✅ LINKED TO SESSION)
    await tx.insert(payments).values({
      locationId,
      saleId,
      cashierId,
      cashSessionId, // ✅ THIS IS THE KEY FIX
      amount,
      method: cleanMethod,
      note: note || null,
    });

    // 7) Cash ledger
    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      type: "SALE_PAYMENT",
      direction: "IN",
      amount,
      method: cleanMethod,
      saleId,
      note: "Sale payment recorded",
    });

    // 8) Complete sale
    const [updatedSale] = await tx
      .update(sales)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    // 9️⃣ Audit log (✅ include locationId)
    await tx.insert(auditLogs).values({
      locationId, // ✅ FIX
      userId: cashierId,
      action: "PAYMENT_RECORD",
      entity: "sale",
      entityId: saleId,
      description: `Payment recorded for sale #${saleId}`,
      meta: null,
    });

    return updatedSale;
  });
}

module.exports = { recordPayment };
