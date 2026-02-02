const { db } = require("../config/db");
const { credits } = require("../db/schema/credits.schema");
const { sales } = require("../db/schema/sales.schema");
const { payments } = require("../db/schema/payments.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");
const { logAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

async function createCredit({ locationId, sellerId, saleId, customerId, note }) {
  return db.transaction(async (tx) => {
    // sale must exist and be PENDING
    const saleRows = await tx.select().from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "SALE_NOT_FOUND";
      throw err;
    }

    if (sale.status !== "PENDING") {
      const err = new Error("Sale must be PENDING to create credit");
      err.code = "BAD_STATUS";
      throw err;
    }

    // prevent duplicate credit record for same sale
    const existing = await tx.execute(sql`
      SELECT id FROM credits WHERE sale_id = ${saleId} LIMIT 1
    `);
    const existingRows = existing.rows || existing;
    if (existingRows.length > 0) {
      const err = new Error("Credit already exists for this sale");
      err.code = "DUPLICATE_CREDIT";
      throw err;
    }

    const [created] = await tx.insert(credits).values({
      locationId,
      saleId,
      customerId,
      amount: sale.totalAmount,
      status: "OPEN",
      createdBy: sellerId,
      note: note || null
    }).returning();

    await logAudit({
      userId: sellerId,
      action: AUDIT.CREDIT_CREATED,
      entity: "credit",
      entityId: created.id,
      description: "Credit created (awaiting approval)",
      meta: { saleId, customerId, amount: sale.totalAmount }
    });

    return created;
  });
}

async function approveCredit({ locationId, managerId, creditId, decision, note }) {
  return db.transaction(async (tx) => {
    const creditRows = await tx.select().from(credits)
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (credit.status !== "OPEN" || credit.approvedAt) {
      const err = new Error("Credit already processed");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (decision === "REJECT") {
      // If rejected, cancel the sale (credit never exists operationally)
      await tx.update(sales).set({
        status: "CANCELED",
        canceledAt: new Date(),
        canceledBy: managerId,
        cancelReason: note || "Credit rejected",
        updatedAt: new Date()
      }).where(eq(sales.id, credit.saleId));

      // mark credit as settled-ish? keep OPEN but approvedAt set? better: set status to SETTLED with note "REJECTED"
      await tx.update(credits).set({
        status: "SETTLED",
        approvedBy: managerId,
        approvedAt: new Date(),
        settledBy: managerId,
        settledAt: new Date(),
        note: note || "Credit rejected (sale canceled)"
      }).where(eq(credits.id, creditId));

      await logAudit({
        userId: managerId,
       action: AUDIT.CREDIT_REJECT,
        description: "Credit rejected (sale canceled)",
        entity: "credit",
        entityId: creditId,
        meta: { decision: "REJECT", note }
      });

      return { ok: true, decision: "REJECT" };
    }

    // APPROVE
    await tx.update(credits).set({
      approvedBy: managerId,
      approvedAt: new Date(),
      note: note || credit.note
    }).where(eq(credits.id, creditId));

    await logAudit({
      userId: managerId,
      action: AUDIT.CREDIT_APPROVE,
      entity: "credit",
      entityId: creditId,
      description: "Credit approved",
      meta: { decision: "APPROVE", note }
    });

    return { ok: true, decision: "APPROVE" };
  });
}

async function settleCredit({ locationId, cashierId, creditId, method, note }) {
  return db.transaction(async (tx) => {
    const creditRows = await tx.select().from(credits)
      .where(and(eq(credits.id, creditId), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (credit.status !== "OPEN") {
      const err = new Error("Credit not open");
      err.code = "BAD_STATUS";
      throw err;
    }

    if (!credit.approvedAt) {
      const err = new Error("Credit must be approved first");
      err.code = "NOT_APPROVED";
      throw err;
    }

    // Ensure payment is not already recorded for sale
    const existingPay = await tx.execute(sql`
      SELECT id FROM payments WHERE sale_id = ${credit.saleId} LIMIT 1
    `);
    const payRows = existingPay.rows || existingPay;
    if (payRows.length > 0) {
      const err = new Error("Payment already recorded for this sale");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    // Record a payment now (settlement)
    const [payment] = await tx.insert(payments).values({
      locationId,
      saleId: credit.saleId,
      cashierId,
      amount: credit.amount,
      method: method || "CASH",
      note: note || "Credit settlement"
    }).returning();

    // Sale becomes completed
    await tx.update(sales).set({
      status: "COMPLETED",
      updatedAt: new Date()
    }).where(eq(sales.id, credit.saleId));

    // Ledger entry
    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      type: "CREDIT_SETTLEMENT",
      direction: "IN",
      amount: credit.amount,
      method: method || "CASH",
      saleId: credit.saleId,
      paymentId: payment.id,
      note: note || "Credit settlement"
    });

    // Close credit
    await tx.update(credits).set({
      status: "SETTLED",
      settledBy: cashierId,
      settledAt: new Date(),
      note: note || credit.note
    }).where(eq(credits.id, creditId));

    await logAudit({
      userId: cashierId,
      action: AUDIT.CREDIT_SETTLED,
      entity: "credit",
      entityId: creditId,
      description: "Credit settled",
      meta: { method: method || "CASH", amount: credit.amount }
    });

    return { ok: true };
  });
}

async function listOpenCredits({ locationId, q }) {
  const pattern = q ? `%${q}%` : null;

  if (!pattern) {
    const res = await db.execute(sql`
      SELECT c.id, c.sale_id as "saleId", c.customer_id as "customerId", c.amount, c.status,
             c.approved_at as "approvedAt", c.created_at as "createdAt"
      FROM credits c
      WHERE c.location_id = ${locationId}
        AND c.status = 'OPEN'
      ORDER BY c.created_at DESC
      LIMIT 50
    `);
    return res.rows || res;
  }

  // Search by customer phone or name via join (simple)
  const res = await db.execute(sql`
    SELECT c.id, c.sale_id as "saleId", c.customer_id as "customerId", c.amount, c.status,
           c.approved_at as "approvedAt", c.created_at as "createdAt",
           cu.name as "customerName", cu.phone as "customerPhone"
    FROM credits c
    JOIN customers cu ON cu.id = c.customer_id
    WHERE c.location_id = ${locationId}
      AND c.status = 'OPEN'
      AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  return res.rows || res;
}

async function getCreditBySale({ locationId, saleId }) {
  const res = await db.execute(require("drizzle-orm").sql`
    SELECT *
    FROM credits
    WHERE location_id = ${locationId}
      AND sale_id = ${saleId}
    LIMIT 1
  `);

  const rows = res.rows || res;
  return rows[0] || null;
}


module.exports = { createCredit, approveCredit, settleCredit, listOpenCredits, getCreditBySale };
