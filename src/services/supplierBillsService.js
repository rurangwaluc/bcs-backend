const { db } = require("../config/db");
const { and, desc, eq } = require("drizzle-orm");

const { suppliers } = require("../db/schema/suppliers.schema");
const { supplierBills } = require("../db/schema/supplier_bills.schema");
const {
  supplierBillItems,
} = require("../db/schema/supplier_bill_items.schema");
const { supplierPayments } = require("../db/schema/supplier_payments.schema");

function toMoneyInt(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function cleanStr(x) {
  const s = x == null ? "" : String(x).trim();
  return s || null;
}

function parseDateOrNull(s) {
  const v = cleanStr(s);
  if (!v) return null;
  // expecting YYYY-MM-DD (or ISO). DB accepts string for date columns via drizzle.
  return v;
}

function billStatusFromAmounts(total, paid) {
  if (total <= 0) return "PAID";
  if (paid <= 0) return "OPEN";
  if (paid >= total) return "PAID";
  return "PARTIALLY_PAID";
}

async function createSupplierBill({ user, payload }) {
  const supplierId = Number(payload.supplierId);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    const err = new Error("Invalid supplierId");
    err.statusCode = 400;
    throw err;
  }

  const sup = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!sup?.[0]) {
    const err = new Error("Supplier not found");
    err.statusCode = 404;
    throw err;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    const err = new Error("Items are required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedItems = items.map((it) => {
    const qty = Number(it?.qty || 0);
    if (!Number.isInteger(qty) || qty <= 0) {
      const err = new Error("Each item qty must be a positive integer");
      err.statusCode = 400;
      throw err;
    }
    const unitCost = toMoneyInt(it?.unitCost);
    const lineTotal = toMoneyInt(qty * unitCost);
    return {
      productId: it?.productId != null ? Number(it.productId) : null,
      productName: String(it?.productName || "").trim() || "Item",
      qty,
      unitCost,
      lineTotal,
    };
  });

  const totalAmount = normalizedItems.reduce(
    (a, b) => a + (Number(b.lineTotal) || 0),
    0,
  );

  const locationId =
    payload.locationId != null
      ? Number(payload.locationId)
      : user?.locationId != null
        ? Number(user.locationId)
        : null;

  const initialPayment = payload.initialPayment || null;
  const initialPaid = initialPayment?.amount
    ? toMoneyInt(initialPayment.amount)
    : 0;

  const paidAmount = Math.min(initialPaid, totalAmount);
  const balanceDue = Math.max(0, totalAmount - paidAmount);
  const status = billStatusFromAmounts(totalAmount, paidAmount);

  const createdBy = user?.id != null ? Number(user.id) : null;

  return await db.transaction(async (tx) => {
    const billRows = await tx
      .insert(supplierBills)
      .values({
        supplierId,
        locationId,
        reference: cleanStr(payload.reference),
        currency: String(payload.currency || "RWF")
          .trim()
          .toUpperCase(),
        status,
        totalAmount,
        paidAmount,
        balanceDue,
        billDate: parseDateOrNull(payload.billDate),
        dueDate: parseDateOrNull(payload.dueDate),
        notes: cleanStr(payload.notes),
        createdBy,
        updatedAt: new Date(),
      })
      .returning();

    const bill = billRows?.[0];
    if (!bill?.id) {
      const err = new Error("Failed to create supplier bill");
      err.statusCode = 500;
      throw err;
    }

    await tx.insert(supplierBillItems).values(
      normalizedItems.map((it) => ({
        supplierBillId: bill.id,
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        unitCost: it.unitCost,
        lineTotal: it.lineTotal,
      })),
    );

    let paymentRow = null;
    if (paidAmount > 0) {
      const pRows = await tx
        .insert(supplierPayments)
        .values({
          supplierBillId: bill.id,
          supplierId,
          locationId,
          amount: paidAmount,
          method: String(initialPayment?.method || "BANK")
            .trim()
            .toUpperCase(),
          reference: cleanStr(initialPayment?.reference),
          note: cleanStr(initialPayment?.note),
          paidAt: cleanStr(initialPayment?.paidAt)
            ? initialPayment.paidAt
            : new Date(),
          createdBy,
        })
        .returning();

      paymentRow = pRows?.[0] || null;
    }

    const full = await getSupplierBillById({ id: bill.id, tx });
    return { bill: full, initialPayment: paymentRow };
  });
}

async function listSupplierBills({
  supplierId,
  status,
  limit = 50,
  offset = 0,
}) {
  const where = [];
  if (supplierId != null)
    where.push(eq(supplierBills.supplierId, Number(supplierId)));
  if (status)
    where.push(eq(supplierBills.status, String(status).trim().toUpperCase()));

  const rows = await db
    .select()
    .from(supplierBills)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierBills.id))
    .limit(Number(limit) || 50)
    .offset(Number(offset) || 0);

  return rows || [];
}

async function getSupplierBillById({ id, tx } = {}) {
  const bid = Number(id);
  if (!Number.isInteger(bid) || bid <= 0) return null;

  const q = tx || db;

  const billRows = await q
    .select()
    .from(supplierBills)
    .where(eq(supplierBills.id, bid))
    .limit(1);
  const bill = billRows?.[0] || null;
  if (!bill) return null;

  const items = await q
    .select()
    .from(supplierBillItems)
    .where(eq(supplierBillItems.supplierBillId, bid))
    .orderBy(desc(supplierBillItems.id));

  const payments = await q
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierBillId, bid))
    .orderBy(desc(supplierPayments.id));

  return { ...bill, items: items || [], payments: payments || [] };
}

async function addSupplierBillPayment({ user, billId, payload }) {
  const bid = Number(billId);
  if (!Number.isInteger(bid) || bid <= 0) {
    const err = new Error("Invalid bill id");
    err.statusCode = 400;
    throw err;
  }

  const amount = toMoneyInt(payload.amount);
  if (amount <= 0) {
    const err = new Error("Amount must be > 0");
    err.statusCode = 400;
    throw err;
  }

  const createdBy = user?.id != null ? Number(user.id) : null;

  return await db.transaction(async (tx) => {
    const billRows = await tx
      .select()
      .from(supplierBills)
      .where(eq(supplierBills.id, bid))
      .limit(1);
    const bill = billRows?.[0];
    if (!bill) {
      const err = new Error("Supplier bill not found");
      err.statusCode = 404;
      throw err;
    }

    const total = Number(bill.totalAmount || 0) || 0;
    const alreadyPaid = Number(bill.paidAmount || 0) || 0;
    const remaining = Math.max(0, total - alreadyPaid);

    if (remaining <= 0) {
      const err = new Error("This bill is already fully paid");
      err.statusCode = 400;
      throw err;
    }

    const payNow = Math.min(amount, remaining);
    const newPaid = alreadyPaid + payNow;
    const newBalance = Math.max(0, total - newPaid);
    const newStatus = billStatusFromAmounts(total, newPaid);

    const pRows = await tx
      .insert(supplierPayments)
      .values({
        supplierBillId: bid,
        supplierId: Number(bill.supplierId),
        locationId: bill.locationId != null ? Number(bill.locationId) : null,
        amount: payNow,
        method: String(payload.method || "BANK")
          .trim()
          .toUpperCase(),
        reference: cleanStr(payload.reference),
        note: cleanStr(payload.note),
        paidAt: cleanStr(payload.paidAt) ? payload.paidAt : new Date(),
        createdBy,
      })
      .returning();

    await tx
      .update(supplierBills)
      .set({
        paidAmount: newPaid,
        balanceDue: newBalance,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(supplierBills.id, bid));

    const full = await getSupplierBillById({ id: bid, tx });
    return { bill: full, payment: pRows?.[0] || null };
  });
}

async function updateSupplierBillStatus({ billId, status }) {
  const bid = Number(billId);
  if (!Number.isInteger(bid) || bid <= 0) return null;

  const st = String(status || "")
    .trim()
    .toUpperCase();
  const ok = ["OPEN", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(st);
  if (!ok) {
    const err = new Error("Invalid status");
    err.statusCode = 400;
    throw err;
  }

  const rows = await db
    .update(supplierBills)
    .set({ status: st, updatedAt: new Date() })
    .where(eq(supplierBills.id, bid))
    .returning();

  return rows?.[0] || null;
}

module.exports = {
  createSupplierBill,
  listSupplierBills,
  getSupplierBillById,
  addSupplierBillPayment,
  updateSupplierBillStatus,
};
