"use strict";

const { db } = require("../config/db");
const { eq, and } = require("drizzle-orm");
const { sql } = require("drizzle-orm");

const notificationService = require("./notificationService");
const { logAudit } = require("./auditService");
const AUDIT = require("../audit/actions");

const { credits } = require("../db/schema/credits.schema");
const { sales } = require("../db/schema/sales.schema");
const { customers } = require("../db/schema/customers.schema");
const { cashLedger } = require("../db/schema/cash_ledger.schema");
const { creditPayments } = require("../db/schema/credit_payments.schema");
const {
  creditInstallments,
} = require("../db/schema/credit_installments.schema");

function normMethod(v) {
  const out = String(v == null ? "" : v)
    .trim()
    .toUpperCase();
  return out || "CASH";
}

function normCreditMode(v) {
  const out = String(v == null ? "" : v)
    .trim()
    .toUpperCase();
  return out || "OPEN_BALANCE";
}

function toNullableInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toPositiveInt(v, code = "BAD_AMOUNT") {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error("Amount must be greater than zero");
    err.code = code;
    err.debug = { value: v };
    throw err;
  }
  return Math.round(n);
}

function toNote(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function toDueDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isPendingStatus(status) {
  const st = String(status || "").toUpperCase();
  return st === "PENDING" || st === "PENDING_APPROVAL";
}

function isCollectibleStatus(status) {
  const st = String(status || "").toUpperCase();
  return st === "APPROVED" || st === "PARTIALLY_PAID";
}

function buildInstallments({
  principalAmount,
  firstDueDate,
  installmentCount,
  installmentAmount,
}) {
  const principal = Math.round(Number(principalAmount || 0));
  const count = Math.round(Number(installmentCount || 0));
  const fixedAmount = Math.round(Number(installmentAmount || 0));
  const due = firstDueDate ? new Date(firstDueDate) : null;

  if (!Number.isFinite(principal) || principal <= 0) {
    const err = new Error("Invalid principal amount");
    err.code = "BAD_INSTALLMENT_PLAN";
    throw err;
  }

  if (!Number.isInteger(count) || count <= 0) {
    const err = new Error("Installment count must be greater than zero");
    err.code = "BAD_INSTALLMENT_PLAN";
    err.debug = { installmentCount };
    throw err;
  }

  if (!Number.isInteger(fixedAmount) || fixedAmount <= 0) {
    const err = new Error("Installment amount must be greater than zero");
    err.code = "BAD_INSTALLMENT_PLAN";
    err.debug = { installmentAmount };
    throw err;
  }

  if (!due || Number.isNaN(due.getTime())) {
    const err = new Error("First installment due date is required");
    err.code = "BAD_INSTALLMENT_PLAN";
    err.debug = { firstDueDate };
    throw err;
  }

  const rows = [];
  let remaining = principal;

  for (let i = 0; i < count; i += 1) {
    const installmentDue = new Date(due);
    installmentDue.setMonth(installmentDue.getMonth() + i);

    const amount =
      i === count - 1 ? remaining : Math.min(fixedAmount, remaining);

    if (amount <= 0) break;

    rows.push({
      sequenceNo: i + 1,
      dueDate: installmentDue,
      amount,
    });

    remaining -= amount;
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    const last = rows[rows.length - 1];
    if (!last) {
      const err = new Error("Failed to create installment schedule");
      err.code = "BAD_INSTALLMENT_PLAN";
      throw err;
    }
    last.amount += remaining;
  }

  return rows;
}

function buildCollectionMessage({
  creditMode,
  isFinal,
  matchedInstallment,
  paymentAmount,
  remainingAmount,
}) {
  const mode = normCreditMode(creditMode);

  if (mode === "INSTALLMENT_PLAN") {
    if (isFinal) {
      return {
        label: "INSTALLMENT_FINAL",
        message: `Final installment payment recorded. Remaining balance: ${remainingAmount}.`,
      };
    }

    if (matchedInstallment) {
      return {
        label: "INSTALLMENT_PAYMENT",
        message: `Installment payment recorded. Remaining balance: ${remainingAmount}.`,
      };
    }

    return {
      label: "INSTALLMENT_EXTRA_PAYMENT",
      message: `Installment-plan payment recorded (${paymentAmount}). Remaining balance: ${remainingAmount}.`,
    };
  }

  if (isFinal) {
    return {
      label: "OPEN_BALANCE_FINAL",
      message: `Final open-balance payment recorded. Remaining balance: ${remainingAmount}.`,
    };
  }

  return {
    label: "OPEN_BALANCE_PARTIAL",
    message: `Open-balance partial payment recorded. Remaining balance: ${remainingAmount}.`,
  };
}

async function createCredit({
  locationId,
  sellerId,
  saleId,
  creditMode = "OPEN_BALANCE",
  dueDate,
  note,
  installmentCount,
  installmentAmount,
  firstInstallmentDate,
}) {
  const sid = Number(saleId);
  if (!Number.isInteger(sid) || sid <= 0) {
    const err = new Error("Invalid sale id");
    err.code = "BAD_SALE_ID";
    throw err;
  }

  const mode = normCreditMode(creditMode);
  const cleanNote = toNote(note);
  const due = toDueDate(dueDate);
  const now = new Date();

  return db.transaction(async (tx) => {
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, sid), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "SALE_NOT_FOUND";
      throw err;
    }

    const saleStatus = String(sale.status || "").toUpperCase();
    const allowed = ["FULFILLED", "AWAITING_PAYMENT_RECORD", "PENDING"];
    if (!allowed.includes(saleStatus)) {
      const err = new Error("Sale cannot create credit from current status");
      err.code = "BAD_STATUS";
      err.debug = { saleStatus, allowed };
      throw err;
    }

    if (!sale.customerId) {
      const err = new Error("Sale must have a customer to create credit");
      err.code = "MISSING_CUSTOMER";
      throw err;
    }

    const custRows = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, sale.customerId),
          eq(customers.locationId, locationId),
        ),
      );

    if (!custRows[0]) {
      const err = new Error("Customer not found for this sale");
      err.code = "CUSTOMER_NOT_FOUND";
      err.debug = { customerId: sale.customerId };
      throw err;
    }

    const existingCreditRes = await tx.execute(sql`
      SELECT id
      FROM credits
      WHERE sale_id = ${sid}
        AND location_id = ${locationId}
      LIMIT 1
    `);
    const existingCreditRows =
      existingCreditRes?.rows || existingCreditRes || [];
    if (existingCreditRows.length > 0) {
      const err = new Error("Credit already exists for this sale");
      err.code = "DUPLICATE_CREDIT";
      throw err;
    }

    const existingPaymentRes = await tx.execute(sql`
      SELECT id
      FROM payments
      WHERE sale_id = ${sid}
        AND location_id = ${locationId}
      LIMIT 1
    `);
    const existingPaymentRows =
      existingPaymentRes?.rows || existingPaymentRes || [];
    if (existingPaymentRows.length > 0) {
      const err = new Error("Payment already recorded for this sale");
      err.code = "DUPLICATE_PAYMENT";
      throw err;
    }

    const principal = Number(sale.totalAmount || 0) || 0;

    const [created] = await tx
      .insert(credits)
      .values({
        locationId,
        saleId: sid,
        customerId: sale.customerId,
        principalAmount: principal,
        paidAmount: 0,
        remainingAmount: principal,
        creditMode: mode,
        dueDate: due,
        status: "PENDING",
        createdBy: sellerId,
        note: cleanNote,
        createdAt: now,
      })
      .returning();

    if (mode === "INSTALLMENT_PLAN") {
      const planRows = buildInstallments({
        principalAmount: principal,
        firstDueDate: firstInstallmentDate || dueDate,
        installmentCount,
        installmentAmount,
      });

      for (const row of planRows) {
        await tx.insert(creditInstallments).values({
          locationId,
          creditId: Number(created.id),
          saleId: sid,
          sequenceNo: row.sequenceNo,
          dueDate: row.dueDate,
          amount: row.amount,
          paidAmount: 0,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await tx
      .update(sales)
      .set({
        status: "PENDING",
        paymentMethod: null,
        updatedAt: now,
      })
      .where(and(eq(sales.id, sid), eq(sales.locationId, locationId)));

    await logAudit({
      locationId,
      userId: sellerId,
      action: AUDIT.CREDIT_CREATED,
      entity: "credit",
      entityId: created.id,
      description: "Credit created (pending approval)",
      meta: {
        saleId: sid,
        customerId: sale.customerId,
        principalAmount: principal,
        dueDate: due ? due.toISOString() : null,
        creditMode: mode,
        installmentCount:
          mode === "INSTALLMENT_PLAN" ? Number(installmentCount || 0) : null,
        installmentAmount:
          mode === "INSTALLMENT_PLAN" ? Number(installmentAmount || 0) : null,
        firstInstallmentDate:
          mode === "INSTALLMENT_PLAN"
            ? firstInstallmentDate || dueDate || null
            : null,
      },
    });

    await notificationService.notifyRoles({
      locationId,
      roles: ["manager", "admin"],
      actorUserId: sellerId,
      type: "CREDIT_REQUEST_CREATED",
      title: `Credit request created for Sale #${sid}`,
      body:
        mode === "INSTALLMENT_PLAN"
          ? `Installment credit request created. Amount: ${principal}. Credit ID: ${created.id}.`
          : `Open-balance credit request created. Amount: ${principal}. Credit ID: ${created.id}.`,
      priority: "warn",
      entity: "credit",
      entityId: Number(created.id),
      tx,
    });

    return created;
  });
}

async function decideCredit({
  locationId,
  managerId,
  creditId,
  decision,
  note,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const dec = String(decision || "").toUpperCase();
  if (dec !== "APPROVE" && dec !== "REJECT") {
    const err = new Error("Invalid decision");
    err.code = "BAD_DECISION";
    err.debug = { decision };
    throw err;
  }

  const cleanNote = toNote(note);
  const now = new Date();

  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (!isPendingStatus(credit.status)) {
      const err = new Error("Credit already processed");
      err.code = "BAD_STATUS";
      err.debug = { status: credit.status };
      throw err;
    }

    if (dec === "REJECT") {
      await tx
        .update(credits)
        .set({
          status: "REJECTED",
          rejectedBy: managerId,
          rejectedAt: now,
          note: cleanNote || credit.note,
        })
        .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

      await tx
        .update(sales)
        .set({
          status: "FULFILLED",
          paymentMethod: null,
          updatedAt: now,
        })
        .where(
          and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
        );

      await logAudit({
        locationId,
        userId: managerId,
        action: AUDIT.CREDIT_REJECT,
        entity: "credit",
        entityId: id,
        description: "Credit rejected",
        meta: {
          saleId: credit.saleId,
          note: cleanNote,
        },
      });

      await notificationService.createNotification({
        locationId,
        recipientUserId: Number(credit.createdBy),
        actorUserId: managerId,
        type: "CREDIT_REJECTED",
        title: `Credit rejected (Sale #${credit.saleId})`,
        body: cleanNote
          ? `Reason: ${cleanNote}`
          : "Credit request was rejected.",
        priority: "normal",
        entity: "credit",
        entityId: Number(id),
        tx,
      });

      return { decision: "REJECT", creditId: id };
    }

    await tx
      .update(credits)
      .set({
        status: "APPROVED",
        approvedBy: managerId,
        approvedAt: now,
        note: cleanNote || credit.note,
      })
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    await tx
      .update(sales)
      .set({
        status: "PENDING",
        updatedAt: now,
      })
      .where(
        and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
      );

    await logAudit({
      locationId,
      userId: managerId,
      action: AUDIT.CREDIT_APPROVE,
      entity: "credit",
      entityId: id,
      description: "Credit approved",
      meta: {
        saleId: credit.saleId,
        note: cleanNote,
      },
    });

    await notificationService.createNotification({
      locationId,
      recipientUserId: Number(credit.createdBy),
      actorUserId: managerId,
      type: "CREDIT_APPROVED",
      title: `Credit approved (Sale #${credit.saleId})`,
      body: cleanNote
        ? `Approved. Note: ${cleanNote}`
        : "Credit request approved.",
      priority: "normal",
      entity: "credit",
      entityId: Number(id),
      tx,
    });

    await notificationService.notifyRoles({
      locationId,
      roles: ["cashier", "admin"],
      actorUserId: managerId,
      type: "CREDIT_APPROVED_READY_FOR_COLLECTION",
      title: `Approved credit ready for collection`,
      body: `Credit #${id} for Sale #${credit.saleId} is approved and may be collected.`,
      priority: "normal",
      entity: "credit",
      entityId: Number(id),
      tx,
    });

    return { decision: "APPROVE", creditId: id };
  });
}

async function recordCreditPayment({
  locationId,
  cashierId,
  creditId,
  amount,
  method,
  note,
  reference,
  cashSessionId,
  installmentId,
}) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const payAmount = toPositiveInt(amount, "BAD_AMOUNT");
  const payMethod = normMethod(method);
  const cleanNote = toNote(note);
  const cleanReference = toNote(reference, 120);
  const installmentTargetId = toNullableInt(installmentId);
  const now = new Date();

  return db.transaction(async (tx) => {
    const creditRows = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    const credit = creditRows[0];
    if (!credit) {
      const err = new Error("Credit not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (!isCollectibleStatus(credit.status)) {
      const err = new Error("Credit must be approved before collection");
      err.code = "NOT_APPROVED";
      err.debug = { status: credit.status };
      throw err;
    }

    const remaining = Number(credit.remainingAmount || 0) || 0;
    if (payAmount > remaining) {
      const err = new Error("Payment exceeds remaining balance");
      err.code = "OVERPAYMENT";
      err.debug = { remaining, attempted: payAmount };
      throw err;
    }

    let resolvedSessionId = toNullableInt(cashSessionId);

    if (payMethod === "CASH") {
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

    let matchedInstallment = null;

    if (normCreditMode(credit.creditMode) === "INSTALLMENT_PLAN") {
      if (installmentTargetId) {
        const found = await tx.execute(sql`
          SELECT *
          FROM credit_installments
          WHERE id = ${installmentTargetId}
            AND credit_id = ${id}
            AND location_id = ${locationId}
          LIMIT 1
        `);
        const foundRows = found?.rows || found || [];
        matchedInstallment = foundRows[0] || null;

        if (!matchedInstallment) {
          const err = new Error("Installment not found");
          err.code = "INSTALLMENT_NOT_FOUND";
          err.debug = { installmentId: installmentTargetId };
          throw err;
        }
      } else {
        const found = await tx.execute(sql`
          SELECT *
          FROM credit_installments
          WHERE credit_id = ${id}
            AND location_id = ${locationId}
            AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
          ORDER BY sequence_no ASC
          LIMIT 1
        `);
        const foundRows = found?.rows || found || [];
        matchedInstallment = foundRows[0] || null;
      }
    }

    const [creditPayment] = await tx
      .insert(creditPayments)
      .values({
        locationId,
        creditId: id,
        saleId: Number(credit.saleId),
        installmentId: matchedInstallment
          ? Number(matchedInstallment.id)
          : null,
        amount: payAmount,
        method: payMethod,
        cashSessionId: resolvedSessionId,
        receivedBy: cashierId,
        reference: cleanReference,
        note: cleanNote,
        createdAt: now,
      })
      .returning();

    if (matchedInstallment) {
      const installmentRemaining = Math.max(
        0,
        Number(matchedInstallment.amount || 0) -
          Number(
            matchedInstallment.paid_amount ||
              matchedInstallment.paidAmount ||
              0,
          ),
      );

      const nextInstallmentPaid =
        Number(
          matchedInstallment.paid_amount || matchedInstallment.paidAmount || 0,
        ) + Math.min(payAmount, installmentRemaining);

      const nextInstallmentStatus =
        nextInstallmentPaid >= Number(matchedInstallment.amount || 0)
          ? "PAID"
          : "PARTIALLY_PAID";

      await tx.execute(sql`
        UPDATE credit_installments
        SET
          paid_amount = ${nextInstallmentPaid},
          status = ${nextInstallmentStatus},
          paid_at = CASE
            WHEN ${nextInstallmentStatus} = 'PAID' THEN ${now}
            ELSE paid_at
          END,
          updated_at = ${now}
        WHERE id = ${Number(matchedInstallment.id)}
      `);
    }

    const nextPaid = (Number(credit.paidAmount || 0) || 0) + payAmount;
    const nextRemaining = Math.max(0, remaining - payAmount);
    const isFinal = nextRemaining === 0;
    const nextStatus = isFinal ? "SETTLED" : "PARTIALLY_PAID";

    await tx
      .update(credits)
      .set({
        paidAmount: nextPaid,
        remainingAmount: nextRemaining,
        status: nextStatus,
        settledBy: isFinal ? cashierId : credit.settledBy,
        settledAt: isFinal ? now : credit.settledAt,
        note: cleanNote || credit.note,
      })
      .where(and(eq(credits.id, id), eq(credits.locationId, locationId)));

    await tx
      .update(sales)
      .set({
        status: isFinal ? "COMPLETED" : "PENDING",
        updatedAt: now,
      })
      .where(
        and(eq(sales.id, credit.saleId), eq(sales.locationId, locationId)),
      );

    await tx.insert(cashLedger).values({
      locationId,
      cashierId,
      cashSessionId: resolvedSessionId,
      type: "CREDIT_PAYMENT",
      direction: "IN",
      amount: payAmount,
      method: payMethod,
      reference: cleanReference,
      saleId: Number(credit.saleId),
      creditId: id,
      creditPaymentId: Number(creditPayment.id),
      note: cleanNote || "Credit payment",
      createdAt: now,
    });

    const messageMeta = buildCollectionMessage({
      creditMode: credit.creditMode,
      isFinal,
      matchedInstallment: !!matchedInstallment,
      paymentAmount: payAmount,
      remainingAmount: nextRemaining,
    });

    await logAudit({
      locationId,
      userId: cashierId,
      action: AUDIT.CREDIT_SETTLED,
      entity: "credit",
      entityId: id,
      description: messageMeta.message,
      meta: {
        saleId: credit.saleId,
        creditPaymentId: creditPayment.id,
        amount: payAmount,
        method: payMethod,
        remainingAmount: nextRemaining,
        cashSessionId: resolvedSessionId,
        creditMode: credit.creditMode,
        installmentId: matchedInstallment
          ? Number(matchedInstallment.id)
          : null,
        messageLabel: messageMeta.label,
      },
    });

    await notificationService.createNotification({
      locationId,
      recipientUserId: Number(credit.createdBy),
      actorUserId: cashierId,
      type: isFinal ? "CREDIT_SETTLED" : "CREDIT_PARTIAL_PAYMENT_RECORDED",
      title: isFinal
        ? `Credit settled (Sale #${credit.saleId})`
        : `Credit payment recorded (Sale #${credit.saleId})`,
      body: messageMeta.message,
      priority: "normal",
      entity: "credit",
      entityId: Number(id),
      tx,
    });

    await notificationService.notifyRoles({
      locationId,
      roles: ["manager", "admin"],
      actorUserId: cashierId,
      type: isFinal ? "CREDIT_SETTLED_INFO" : "CREDIT_PARTIAL_PAYMENT_INFO",
      title: isFinal
        ? `Credit settled for Sale #${credit.saleId}`
        : `Credit payment recorded for Sale #${credit.saleId}`,
      body: messageMeta.message,
      priority: "normal",
      entity: "credit",
      entityId: Number(id),
      tx,
    });

    return {
      creditId: id,
      creditPaymentId: Number(creditPayment.id),
      saleId: Number(credit.saleId),
      amountRecorded: payAmount,
      paidAmount: nextPaid,
      remainingAmount: nextRemaining,
      status: nextStatus,
      creditMode: normCreditMode(credit.creditMode),
      installmentId: matchedInstallment ? Number(matchedInstallment.id) : null,
      messageLabel: messageMeta.label,
      message: messageMeta.message,
    };
  });
}

async function listOpenCredits({ locationId, q }) {
  const pattern = q ? `%${String(q).trim()}%` : null;

  const res = await db.execute(sql`
    SELECT
      c.id,
      c.sale_id as "saleId",
      c.customer_id as "customerId",
      cu.name as "customerName",
      cu.phone as "customerPhone",
      c.principal_amount as "principalAmount",
      c.paid_amount as "paidAmount",
      c.remaining_amount as "remainingAmount",
      c.credit_mode as "creditMode",
      c.due_date as "dueDate",
      c.status,
      c.approved_at as "approvedAt",
      c.rejected_at as "rejectedAt",
      c.settled_at as "settledAt",
      c.created_at as "createdAt"
    FROM credits c
    JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE c.location_id = ${locationId}
      AND c.status IN ('PENDING', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID')
      ${
        pattern
          ? sql`AND (cu.name ILIKE ${pattern} OR cu.phone ILIKE ${pattern})`
          : sql``
      }
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  return res?.rows || res || [];
}

async function getCreditBySale({ locationId, saleId }) {
  const sid = Number(saleId);
  if (!Number.isInteger(sid) || sid <= 0) return null;

  const res = await db.execute(sql`
    SELECT *
    FROM credits
    WHERE location_id = ${locationId}
      AND sale_id = ${sid}
    LIMIT 1
  `);

  const rows = res?.rows || res || [];
  return rows[0] || null;
}

module.exports = {
  createCredit,
  decideCredit,
  approveCredit: decideCredit,
  recordCreditPayment,
  settleCredit: recordCreditPayment,
  listOpenCredits,
  getCreditBySale,
};
