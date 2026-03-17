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

function formatIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildCreditStatusLabel(status, creditMode) {
  const st = String(status || "")
    .trim()
    .toUpperCase();
  const mode = normCreditMode(creditMode);

  if (st === "PENDING" || st === "PENDING_APPROVAL") {
    return "Pending approval";
  }

  if (st === "APPROVED") {
    return mode === "INSTALLMENT_PLAN"
      ? "Approved as installment plan"
      : "Approved as open balance";
  }

  if (st === "PARTIALLY_PAID") {
    return "Partially paid";
  }

  if (st === "SETTLED") {
    return "Settled";
  }

  if (st === "REJECTED") {
    return "Credit request rejected";
  }

  return st || "—";
}

function getInstallmentRemaining(installment) {
  if (!installment) return 0;

  const explicitRemaining = Number(
    installment?.remainingAmount ?? installment?.remaining_amount,
  );
  if (Number.isFinite(explicitRemaining)) {
    return Math.max(0, Math.round(explicitRemaining));
  }

  const amount = Number(installment?.amount ?? 0) || 0;
  const paid =
    Number(installment?.paidAmount ?? installment?.paid_amount ?? 0) || 0;

  return Math.max(0, Math.round(amount - paid));
}

function findNextActiveInstallment(installments) {
  const rows = Array.isArray(installments) ? installments : [];

  const active = rows.filter((it) => {
    const st = String(it?.status || "").toUpperCase();
    return st === "PENDING" || st === "PARTIALLY_PAID" || st === "OVERDUE";
  });

  if (!active.length) return null;

  active.sort((a, b) => {
    const ad = new Date(a?.dueDate || a?.due_date || 0).getTime();
    const bd = new Date(b?.dueDate || b?.due_date || 0).getTime();
    return ad - bd;
  });

  return active[0] || null;
}

function buildPlanSummary({ creditMode, installments, dueDate }) {
  const mode = normCreditMode(creditMode);
  const rows = Array.isArray(installments) ? installments : [];

  if (mode === "INSTALLMENT_PLAN") {
    const count = rows.length;
    if (count > 0) {
      return `${count} installment${count === 1 ? "" : "s"} planned`;
    }
    return "Installment plan";
  }

  if (dueDate) return "Open balance";
  return "Single running balance";
}

function buildRemainingBalanceLabel(remainingAmount) {
  const remaining = Number(remainingAmount || 0) || 0;
  return `Remaining balance ${Math.round(remaining).toLocaleString()} RWF`;
}

function buildNextInstallmentFields({ creditMode, installments, dueDate }) {
  const mode = normCreditMode(creditMode);

  if (mode === "INSTALLMENT_PLAN") {
    const next = findNextActiveInstallment(installments);
    const nextDue = next?.dueDate || next?.due_date || null;

    return {
      nextInstallmentDue: formatIsoOrNull(nextDue),
      nextInstallmentLabel: nextDue ? "Next installment due" : null,
      nextInstallmentId: next?.id ? Number(next.id) : null,
      nextInstallmentSequenceNo:
        next?.installmentNo ?? next?.installment_no ?? next?.sequenceNo ?? null,
      nextInstallmentRemaining: next ? getInstallmentRemaining(next) : null,
    };
  }

  return {
    nextInstallmentDue: formatIsoOrNull(dueDate),
    nextInstallmentLabel: dueDate ? "Due" : null,
    nextInstallmentId: null,
    nextInstallmentSequenceNo: null,
    nextInstallmentRemaining: null,
  };
}

function decorateCreditRow(row, opts = {}) {
  if (!row) return row;

  const creditMode = normCreditMode(row.creditMode || row.credit_mode);
  const status = String(row.status || "").toUpperCase();

  const principalAmount =
    Number(row.principalAmount ?? row.principal_amount ?? row.amount ?? 0) || 0;

  const paidAmount = Number(row.paidAmount ?? row.paid_amount ?? 0) || 0;

  const remainingAmount =
    Number(
      row.remainingAmount ??
        row.remaining_amount ??
        Math.max(0, principalAmount - paidAmount),
    ) || 0;

  const dueDate = row.dueDate || row.due_date || null;
  const installments = Array.isArray(opts.installments)
    ? opts.installments
    : [];

  const nextFields = buildNextInstallmentFields({
    creditMode,
    installments,
    dueDate,
  });

  return {
    ...row,
    creditMode,
    status,
    principalAmount,
    paidAmount,
    remainingAmount,
    statusLabel: buildCreditStatusLabel(status, creditMode),
    planSummary: buildPlanSummary({
      creditMode,
      installments,
      dueDate,
    }),
    nextInstallmentDue: nextFields.nextInstallmentDue,
    nextInstallmentLabel: nextFields.nextInstallmentLabel,
    nextInstallmentId: nextFields.nextInstallmentId,
    nextInstallmentSequenceNo: nextFields.nextInstallmentSequenceNo,
    nextInstallmentRemaining: nextFields.nextInstallmentRemaining,
    remainingBalanceLabel: buildRemainingBalanceLabel(remainingAmount),
  };
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
      installmentNo: i + 1,
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
  const amountText = `${Math.round(Number(paymentAmount || 0))}`;
  const remainingText = `${Math.max(
    0,
    Math.round(Number(remainingAmount || 0)),
  )}`;

  if (isFinal) {
    return {
      label: "FINAL_SETTLEMENT_COMPLETED",
      shortMessage: "Final settlement completed",
      detailMessage: `Final settlement completed. Remaining balance: ${remainingText}.`,
    };
  }

  if (mode === "INSTALLMENT_PLAN") {
    if (matchedInstallment) {
      return {
        label: "INSTALLMENT_PAYMENT_RECORDED",
        shortMessage: "Installment payment recorded successfully",
        detailMessage: `Installment payment recorded successfully. Remaining balance: ${remainingText}.`,
      };
    }

    return {
      label: "INSTALLMENT_PLAN_PAYMENT_RECORDED",
      shortMessage: "Installment payment recorded successfully",
      detailMessage: `Installment payment recorded successfully. Amount recorded: ${amountText}. Remaining balance: ${remainingText}.`,
    };
  }

  return {
    label: "OPEN_BALANCE_PAYMENT_RECORDED",
    shortMessage: "Open balance payment recorded successfully",
    detailMessage: `Open balance payment recorded successfully. Remaining balance: ${remainingText}.`,
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
          installmentNo: row.installmentNo,
          amount: row.amount,
          paidAmount: 0,
          remainingAmount: row.amount,
          dueDate: row.dueDate,
          status: "PENDING",
          createdAt: now,
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

    return decorateCreditRow(created, { installments: [] });
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

    const creditMode = normCreditMode(credit.creditMode);

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
        description: "Credit request rejected",
        meta: {
          saleId: credit.saleId,
          note: cleanNote,
          creditMode,
          message: "Credit request rejected",
        },
      });

      await notificationService.createNotification({
        locationId,
        recipientUserId: Number(credit.createdBy),
        actorUserId: managerId,
        type: "CREDIT_REJECTED",
        title: `Credit rejected (Sale #${credit.saleId})`,
        body: cleanNote
          ? `Credit request rejected. Reason: ${cleanNote}`
          : "Credit request rejected.",
        priority: "normal",
        entity: "credit",
        entityId: Number(id),
        tx,
      });

      return {
        decision: "REJECT",
        creditId: id,
        creditMode,
        status: "REJECTED",
        statusLabel: buildCreditStatusLabel("REJECTED", creditMode),
        saleId: Number(credit.saleId),
        message: "Credit request rejected",
        detailMessage: "Credit request rejected",
      };
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

    const approvalMessage =
      creditMode === "INSTALLMENT_PLAN"
        ? "Approved as installment plan"
        : "Approved as open balance";

    await logAudit({
      locationId,
      userId: managerId,
      action: AUDIT.CREDIT_APPROVE,
      entity: "credit",
      entityId: id,
      description: approvalMessage,
      meta: {
        saleId: credit.saleId,
        note: cleanNote,
        creditMode,
        message: approvalMessage,
      },
    });

    await notificationService.createNotification({
      locationId,
      recipientUserId: Number(credit.createdBy),
      actorUserId: managerId,
      type: "CREDIT_APPROVED",
      title: `Credit approved (Sale #${credit.saleId})`,
      body: cleanNote
        ? `${approvalMessage}. Note: ${cleanNote}`
        : `${approvalMessage}.`,
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
      title: "Approved credit ready for collection",
      body:
        creditMode === "INSTALLMENT_PLAN"
          ? `Credit #${id} for Sale #${credit.saleId} is approved as installment plan and may be collected.`
          : `Credit #${id} for Sale #${credit.saleId} is approved as open balance and may be collected.`,
      priority: "normal",
      entity: "credit",
      entityId: Number(id),
      tx,
    });

    return {
      decision: "APPROVE",
      creditId: id,
      creditMode,
      status: "APPROVED",
      statusLabel: buildCreditStatusLabel("APPROVED", creditMode),
      saleId: Number(credit.saleId),
      message: approvalMessage,
      detailMessage: approvalMessage,
    };
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
      const err = new Error("Credit is not yet approved for collection");
      err.code = "NOT_APPROVED";
      err.debug = { status: credit.status };
      throw err;
    }

    const remaining = Number(credit.remainingAmount || 0) || 0;
    const creditMode = normCreditMode(credit.creditMode);

    if (payAmount > remaining) {
      const err = new Error(
        creditMode === "INSTALLMENT_PLAN"
          ? "Installment payment exceeds credit remaining balance"
          : "Open balance payment exceeds credit remaining balance",
      );
      err.code = "OVERPAYMENT";
      err.debug = { remaining, attempted: payAmount, creditMode };
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

    if (creditMode === "INSTALLMENT_PLAN") {
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
          ORDER BY installment_no ASC, due_date ASC
          LIMIT 1
        `);
        const foundRows = found?.rows || found || [];
        matchedInstallment = foundRows[0] || null;
      }
    }

    if (matchedInstallment) {
      const installmentRemaining = getInstallmentRemaining(matchedInstallment);

      if (payAmount > installmentRemaining) {
        const err = new Error(
          "Installment payment exceeds active installment remaining",
        );
        err.code = "INSTALLMENT_OVERPAYMENT";
        err.debug = {
          installmentId: Number(matchedInstallment.id),
          installmentRemaining,
          attempted: payAmount,
        };
        throw err;
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
      const installmentAmount = Number(matchedInstallment.amount || 0) || 0;
      const installmentPaidBefore =
        Number(
          matchedInstallment.paidAmount ?? matchedInstallment.paid_amount ?? 0,
        ) || 0;
      const nextInstallmentPaid = installmentPaidBefore + payAmount;
      const nextInstallmentRemaining = Math.max(
        0,
        installmentAmount - nextInstallmentPaid,
      );
      const nextInstallmentStatus =
        nextInstallmentRemaining === 0 ? "PAID" : "PARTIALLY_PAID";

      await tx.execute(sql`
        UPDATE credit_installments
        SET
          paid_amount = ${nextInstallmentPaid},
          remaining_amount = ${nextInstallmentRemaining},
          status = ${nextInstallmentStatus},
          paid_at = CASE
            WHEN ${nextInstallmentStatus} = 'PAID' THEN ${now}
            ELSE paid_at
          END
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
      description: messageMeta.detailMessage,
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
      body: messageMeta.detailMessage,
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
      body: messageMeta.detailMessage,
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
      remainingBalanceLabel: buildRemainingBalanceLabel(nextRemaining),
      status: nextStatus,
      statusLabel: buildCreditStatusLabel(nextStatus, credit.creditMode),
      creditMode: normCreditMode(credit.creditMode),
      installmentId: matchedInstallment ? Number(matchedInstallment.id) : null,
      messageLabel: messageMeta.label,
      message: messageMeta.shortMessage,
      detailMessage: messageMeta.detailMessage,
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
      AND c.status IN ('PENDING', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'SETTLED', 'REJECTED')
      ${
        pattern
          ? sql`AND (
              cu.name ILIKE ${pattern}
              OR cu.phone ILIKE ${pattern}
              OR CAST(c.id AS TEXT) ILIKE ${pattern}
              OR CAST(c.sale_id AS TEXT) ILIKE ${pattern}
            )`
          : sql``
      }
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  const rows = res?.rows || res || [];
  return rows.map((row) => decorateCreditRow(row, { installments: [] }));
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
  const row = rows[0] || null;
  return row ? decorateCreditRow(row, { installments: [] }) : null;
}

async function getCreditById({ locationId, creditId }) {
  const id = Number(creditId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid credit id");
    err.code = "BAD_CREDIT_ID";
    throw err;
  }

  const creditRes = await db.execute(sql`
    SELECT
      c.id,
      c.location_id as "locationId",
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
      c.note,
      c.created_by as "createdBy",
      c.approved_by as "approvedBy",
      c.approved_at as "approvedAt",
      c.rejected_by as "rejectedBy",
      c.rejected_at as "rejectedAt",
      c.settled_by as "settledBy",
      c.settled_at as "settledAt",
      c.created_at as "createdAt"
    FROM credits c
    LEFT JOIN customers cu
      ON cu.id = c.customer_id
     AND cu.location_id = c.location_id
    WHERE c.location_id = ${locationId}
      AND c.id = ${id}
    LIMIT 1
  `);

  const creditRows = creditRes?.rows || creditRes || [];
  const rawCredit = creditRows[0];

  if (!rawCredit) {
    const err = new Error("Credit not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const installmentsRes = await db.execute(sql`
    SELECT
      id,
      installment_no as "installmentNo",
      amount,
      paid_amount as "paidAmount",
      remaining_amount as "remainingAmount",
      due_date as "dueDate",
      status,
      paid_at as "paidAt",
      note,
      created_at as "createdAt"
    FROM credit_installments
    WHERE location_id = ${locationId}
      AND credit_id = ${id}
    ORDER BY installment_no ASC, id ASC
  `);

  const paymentsRes = await db.execute(sql`
    SELECT
      cp.id,
      cp.amount,
      cp.method,
      cp.reference,
      cp.note,
      cp.created_at as "createdAt",
      ci.installment_no as "installmentSequenceNo"
    FROM credit_payments cp
    LEFT JOIN credit_installments ci
      ON ci.id = cp.installment_id
    WHERE cp.location_id = ${locationId}
      AND cp.credit_id = ${id}
    ORDER BY cp.created_at DESC
  `);

  const itemsRes = await db.execute(sql`
    SELECT
      si.id,
      si.product_id as "productId",
      COALESCE(p.name, si.product_name) as "productName",
      COALESCE(p.sku, si.sku) as sku,
      si.qty,
      si.unit_price as "unitPrice",
      si.line_total as "lineTotal"
    FROM sale_items si
    LEFT JOIN products p
      ON p.id = si.product_id
     AND p.location_id = si.location_id
    WHERE si.location_id = ${locationId}
      AND si.sale_id = ${Number(rawCredit.saleId)}
    ORDER BY si.id ASC
  `);

  const installments = installmentsRes?.rows || installmentsRes || [];
  const payments = paymentsRes?.rows || paymentsRes || [];
  const items = itemsRes?.rows || itemsRes || [];

  const credit = decorateCreditRow(rawCredit, { installments });

  return {
    ...credit,
    items,
    payments,
    installments,
  };
}

module.exports = {
  createCredit,
  decideCredit,
  approveCredit: decideCredit,
  recordCreditPayment,
  settleCredit: recordCreditPayment,
  listOpenCredits,
  getCreditBySale,
  getCreditById,
};
