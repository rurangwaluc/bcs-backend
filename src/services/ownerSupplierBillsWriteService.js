"use strict";

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

function toInt(v, dflt = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function normalizeCurrency(v, fallback = "RWF") {
  return (
    String(v || fallback)
      .trim()
      .toUpperCase()
      .slice(0, 8) || fallback
  );
}

function normalizeStatus(v) {
  return String(v || "")
    .trim()
    .toUpperCase();
}

function parseDateOrNull(v) {
  const s = cleanStr(v);
  return s || null;
}

function billStatusFromAmounts(total, paid, currentStatus = null) {
  const t = Math.max(0, toInt(total, 0) || 0);
  const p = Math.max(0, toInt(paid, 0) || 0);
  const current = normalizeStatus(currentStatus);

  if (current === "VOID") return "VOID";
  if (current === "DRAFT" && p <= 0) return "DRAFT";
  if (t <= 0) return "PAID";
  if (p <= 0) return "OPEN";
  if (p >= t) return "PAID";
  return "PARTIALLY_PAID";
}

function computeTotalsFromItems(items) {
  const clean = Array.isArray(items) ? items : [];

  const lines = clean.map((it) => {
    const qty = Math.max(0, Math.trunc(Number(it?.qty) || 0));
    const unitCost = Math.max(0, Math.trunc(Number(it?.unitCost) || 0));
    const lineTotal = qty * unitCost;

    return {
      productId:
        it?.productId != null
          ? Math.trunc(Number(it.productId) || 0) || null
          : null,
      description: String(it?.description || "").trim() || "Item",
      qty,
      unitCost,
      lineTotal,
    };
  });

  const totalAmount = lines.reduce(
    (sum, row) => sum + (Number(row.lineTotal) || 0),
    0,
  );

  return { totalAmount, lines };
}

async function getLocationOrThrow(tx, locationId) {
  const rows = await tx.execute(sql`
    SELECT
      l.id,
      l.name,
      l.code,
      l.status
    FROM locations l
    WHERE l.id = ${locationId}
    LIMIT 1
  `);

  const location = (rows.rows || rows || [])[0];
  if (!location) {
    const err = new Error("Branch not found");
    err.code = "LOCATION_NOT_FOUND";
    throw err;
  }

  return location;
}

async function getSupplierOrThrow(tx, supplierId) {
  const rows = await tx.execute(sql`
    SELECT
      s.id,
      s.name,
      s.default_currency as "defaultCurrency",
      s.is_active as "isActive"
    FROM suppliers s
    WHERE s.id = ${supplierId}
    LIMIT 1
  `);

  const supplier = (rows.rows || rows || [])[0];
  if (!supplier) {
    const err = new Error("Supplier not found");
    err.code = "SUPPLIER_NOT_FOUND";
    throw err;
  }

  return supplier;
}

async function getBillOrThrow(tx, billId) {
  const rows = await tx.execute(sql`
    SELECT
      sb.id,
      sb.location_id as "locationId",
      sb.supplier_id as "supplierId",
      sb.bill_no as "billNo",
      sb.currency as "currency",
      sb.total_amount as "totalAmount",
      sb.paid_amount as "paidAmount",
      sb.status as "status",
      sb.issued_date as "issuedDate",
      sb.due_date as "dueDate",
      sb.note as "note",
      sb.created_by_user_id as "createdByUserId",
      sb.created_at as "createdAt",
      sb.updated_at as "updatedAt"
    FROM supplier_bills sb
    WHERE sb.id = ${billId}
    LIMIT 1
  `);

  const bill = (rows.rows || rows || [])[0];
  if (!bill) {
    const err = new Error("Supplier bill not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  return bill;
}

async function getOwnerSupplierBillById(tx, billId) {
  const billRes = await tx.execute(sql`
    SELECT
      sb.id,
      sb.location_id as "locationId",
      l.name as "locationName",
      l.code as "locationCode",

      sb.supplier_id as "supplierId",
      s.name as "supplierName",
      s.default_currency as "supplierDefaultCurrency",

      u.name as "createdByName",

      sb.bill_no as "billNo",
      sb.currency as "currency",
      sb.total_amount as "totalAmount",
      sb.paid_amount as "paidAmount",
      GREATEST(sb.total_amount - sb.paid_amount, 0)::int as "balance",
      sb.status as "status",
      sb.issued_date as "issuedDate",
      sb.due_date as "dueDate",
      sb.note as "note",
      sb.created_by_user_id as "createdByUserId",
      sb.created_at as "createdAt",
      sb.updated_at as "updatedAt",

      CASE
        WHEN sb.status NOT IN ('PAID', 'VOID')
         AND sb.due_date IS NOT NULL
         AND sb.due_date < CURRENT_DATE
        THEN true
        ELSE false
      END as "isOverdue",

      CASE
        WHEN sb.status NOT IN ('PAID', 'VOID')
         AND sb.due_date IS NOT NULL
         AND sb.due_date < CURRENT_DATE
        THEN (CURRENT_DATE - sb.due_date)::int
        ELSE 0
      END as "daysOverdue"

    FROM supplier_bills sb
    JOIN suppliers s ON s.id = sb.supplier_id
    JOIN locations l ON l.id = sb.location_id
    LEFT JOIN users u ON u.id = sb.created_by_user_id
    WHERE sb.id = ${billId}
    LIMIT 1
  `);

  const bill = (billRes.rows || billRes || [])[0];
  if (!bill) return null;

  const itemsRes = await tx.execute(sql`
    SELECT
      id,
      supplier_bill_id as "billId",
      product_id as "productId",
      product_name as "description",
      qty,
      unit_cost as "unitCost",
      line_total as "lineTotal"
    FROM supplier_bill_items
    WHERE supplier_bill_id = ${billId}
    ORDER BY id ASC
  `);

  const paymentsRes = await tx.execute(sql`
    SELECT
      sbp.id,
      sbp.bill_id as "billId",
      sbp.amount,
      sbp.method,
      sbp.reference,
      sbp.note,
      sbp.paid_at as "paidAt",
      sbp.created_by_user_id as "createdByUserId",
      u.name as "createdByName",
      sbp.created_at as "createdAt"
    FROM supplier_bill_payments sbp
    LEFT JOIN users u ON u.id = sbp.created_by_user_id
    WHERE sbp.bill_id = ${billId}
    ORDER BY sbp.paid_at DESC, sbp.id DESC
  `);

  return {
    bill,
    items: itemsRes.rows || itemsRes || [],
    payments: paymentsRes.rows || paymentsRes || [],
  };
}

async function createOwnerSupplierBill({
  ownerUserId,
  ownerLocationId,
  payload,
}) {
  const supplierId = toInt(payload?.supplierId, null);
  const locationId = toInt(payload?.locationId, ownerLocationId || null);

  if (!supplierId || supplierId <= 0) {
    const err = new Error("Invalid supplier id");
    err.code = "BAD_SUPPLIER_ID";
    throw err;
  }

  if (!locationId || locationId <= 0) {
    const err = new Error("Invalid location id");
    err.code = "BAD_LOCATION_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const supplier = await getSupplierOrThrow(tx, supplierId);
    await getLocationOrThrow(tx, locationId);

    let totalAmount = 0;
    let lines = [];

    if (Array.isArray(payload?.items) && payload.items.length > 0) {
      const computed = computeTotalsFromItems(payload.items);
      totalAmount = computed.totalAmount;
      lines = computed.lines;
    } else {
      totalAmount = Math.max(0, toInt(payload?.totalAmount, 0) || 0);
    }

    if (totalAmount <= 0) {
      const err = new Error("totalAmount must be greater than zero");
      err.code = "BAD_TOTAL";
      throw err;
    }

    const paidAmount = 0;
    const requestedStatus = normalizeStatus(payload?.status || "OPEN");
    const status =
      requestedStatus === "DRAFT"
        ? "DRAFT"
        : billStatusFromAmounts(totalAmount, paidAmount, requestedStatus);

    const currency = normalizeCurrency(
      payload?.currency,
      supplier?.defaultCurrency || "RWF",
    );

    const insertRes = await tx.execute(sql`
      INSERT INTO supplier_bills (
        location_id,
        supplier_id,
        bill_no,
        currency,
        total_amount,
        paid_amount,
        status,
        issued_date,
        due_date,
        note,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ${locationId},
        ${supplierId},
        ${cleanStr(payload?.billNo)},
        ${currency},
        ${totalAmount},
        0,
        ${status},
        ${parseDateOrNull(payload?.issuedDate)},
        ${parseDateOrNull(payload?.dueDate)},
        ${cleanStr(payload?.note)},
        ${ownerUserId},
        NOW(),
        NOW()
      )
      RETURNING id
    `);

    const created = (insertRes.rows || insertRes || [])[0];
    const billId = created?.id;

    if (!billId) {
      const err = new Error("Failed to create supplier bill");
      err.code = "CREATE_FAILED";
      throw err;
    }

    if (lines.length > 0) {
      for (const line of lines) {
        await tx.execute(sql`
          INSERT INTO supplier_bill_items (
            supplier_bill_id,
            product_id,
            product_name,
            qty,
            unit_cost,
            line_total
          )
          VALUES (
            ${billId},
            ${line.productId},
            ${line.description},
            ${line.qty},
            ${line.unitCost},
            ${line.lineTotal}
          )
        `);
      }
    }

    await tx.execute(sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description
      )
      VALUES (
        ${locationId},
        ${ownerUserId},
        'OWNER_SUPPLIER_BILL_CREATE',
        'supplier_bill',
        ${billId},
        ${`Owner created supplier bill #${billId}`}
      )
    `);

    return getOwnerSupplierBillById(tx, billId);
  });
}

async function updateOwnerSupplierBill({ ownerUserId, billId, payload }) {
  const id = toInt(billId, null);
  if (!id) {
    const err = new Error("Invalid bill id");
    err.code = "BAD_BILL_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const existing = await getBillOrThrow(tx, id);

    if (normalizeStatus(existing.status) === "VOID") {
      const err = new Error("VOID bill cannot be updated");
      err.code = "VOID_LOCKED";
      throw err;
    }

    const patch = {};
    const hasItems = Array.isArray(payload?.items);
    let recomputedTotal = null;
    let recomputedLines = null;

    if (payload?.supplierId !== undefined) {
      const nextSupplierId = toInt(payload.supplierId, null);
      if (!nextSupplierId) {
        const err = new Error("Invalid supplier id");
        err.code = "BAD_SUPPLIER_ID";
        throw err;
      }

      await getSupplierOrThrow(tx, nextSupplierId);
      patch.supplier_id = nextSupplierId;
    }

    if (payload?.locationId !== undefined) {
      const nextLocationId = toInt(payload.locationId, null);
      if (!nextLocationId) {
        const err = new Error("Invalid location id");
        err.code = "BAD_LOCATION_ID";
        throw err;
      }

      await getLocationOrThrow(tx, nextLocationId);
      patch.location_id = nextLocationId;
    }

    if (payload?.billNo !== undefined) {
      patch.bill_no = cleanStr(payload.billNo);
    }

    if (payload?.currency !== undefined) {
      patch.currency = normalizeCurrency(
        payload.currency,
        existing.currency || "RWF",
      );
    }

    if (payload?.issuedDate !== undefined) {
      patch.issued_date = parseDateOrNull(payload.issuedDate);
    }

    if (payload?.dueDate !== undefined) {
      patch.due_date = parseDateOrNull(payload.dueDate);
    }

    if (payload?.note !== undefined) {
      patch.note = cleanStr(payload.note);
    }

    if (payload?.totalAmount !== undefined && !hasItems) {
      const total = Math.max(0, toInt(payload.totalAmount, 0) || 0);
      if (total <= 0) {
        const err = new Error("totalAmount must be greater than zero");
        err.code = "BAD_TOTAL";
        throw err;
      }
      recomputedTotal = total;
    }

    if (hasItems) {
      const computed = computeTotalsFromItems(payload.items);
      if (computed.totalAmount <= 0) {
        const err = new Error(
          "items must produce totalAmount greater than zero",
        );
        err.code = "BAD_ITEMS";
        throw err;
      }
      recomputedTotal = computed.totalAmount;
      recomputedLines = computed.lines;
    }

    const currentPaid = Math.max(0, Number(existing.paidAmount || 0));
    if (recomputedTotal != null && currentPaid > recomputedTotal) {
      const err = new Error("paid amount cannot exceed updated total amount");
      err.code = "PAID_EXCEEDS_TOTAL";
      throw err;
    }

    const requestedStatus =
      payload?.status !== undefined ? normalizeStatus(payload.status) : null;

    if (recomputedTotal != null) {
      patch.total_amount = recomputedTotal;
    }

    const nextTotal =
      recomputedTotal != null
        ? recomputedTotal
        : Math.max(0, Number(existing.totalAmount || 0));

    const derivedStatus = billStatusFromAmounts(
      nextTotal,
      currentPaid,
      requestedStatus || existing.status,
    );

    if (requestedStatus === "VOID") {
      const err = new Error("Use void action instead of update status VOID");
      err.code = "USE_VOID_ACTION";
      throw err;
    }

    patch.status =
      requestedStatus === "DRAFT" && currentPaid <= 0 ? "DRAFT" : derivedStatus;

    patch.updated_at = new Date();

    await tx.execute(sql`
      UPDATE supplier_bills
      SET
        supplier_id = COALESCE(${patch.supplier_id ?? null}, supplier_id),
        location_id = COALESCE(${patch.location_id ?? null}, location_id),
        bill_no = COALESCE(${patch.bill_no ?? null}, bill_no),
        currency = COALESCE(${patch.currency ?? null}, currency),
        total_amount = COALESCE(${patch.total_amount ?? null}, total_amount),
        status = ${patch.status},
        issued_date = COALESCE(${patch.issued_date ?? null}, issued_date),
        due_date = COALESCE(${patch.due_date ?? null}, due_date),
        note = COALESCE(${patch.note ?? null}, note),
        updated_at = ${patch.updated_at}
      WHERE id = ${id}
    `);

    if (recomputedLines) {
      await tx.execute(
        sql`DELETE FROM supplier_bill_items WHERE supplier_bill_id = ${id}`,
      );

      for (const line of recomputedLines) {
        await tx.execute(sql`
          INSERT INTO supplier_bill_items (
            supplier_bill_id,
            product_id,
            product_name,
            qty,
            unit_cost,
            line_total
          )
          VALUES (
            ${id},
            ${line.productId},
            ${line.description},
            ${line.qty},
            ${line.unitCost},
            ${line.lineTotal}
          )
        `);
      }
    }

    await tx.execute(sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description
      )
      VALUES (
        ${patch.location_id ?? existing.locationId},
        ${ownerUserId},
        'OWNER_SUPPLIER_BILL_UPDATE',
        'supplier_bill',
        ${id},
        ${`Owner updated supplier bill #${id}`}
      )
    `);

    return getOwnerSupplierBillById(tx, id);
  });
}

async function addOwnerSupplierBillPayment({ ownerUserId, billId, payload }) {
  const id = toInt(billId, null);
  if (!id) {
    const err = new Error("Invalid bill id");
    err.code = "BAD_BILL_ID";
    throw err;
  }

  const amount = Math.max(0, toInt(payload?.amount, 0) || 0);
  if (amount <= 0) {
    const err = new Error("Amount must be greater than zero");
    err.code = "BAD_AMOUNT";
    throw err;
  }

  return db.transaction(async (tx) => {
    const existing = await getBillOrThrow(tx, id);
    const currentStatus = normalizeStatus(existing.status);

    if (currentStatus === "VOID") {
      const err = new Error("Cannot pay a VOID bill");
      err.code = "VOID_LOCKED";
      throw err;
    }

    const total = Math.max(0, Number(existing.totalAmount || 0));
    const paid = Math.max(0, Number(existing.paidAmount || 0));
    const balance = Math.max(0, total - paid);

    if (balance <= 0) {
      const err = new Error("Bill is already fully paid");
      err.code = "ALREADY_PAID";
      throw err;
    }

    if (amount > balance) {
      const err = new Error(`Payment exceeds remaining balance ${balance}`);
      err.code = "EXCEEDS_BALANCE";
      throw err;
    }

    const nextPaid = paid + amount;
    const nextStatus = billStatusFromAmounts(total, nextPaid, existing.status);

    await tx.execute(sql`
      INSERT INTO supplier_bill_payments (
        bill_id,
        amount,
        method,
        reference,
        note,
        paid_at,
        created_by_user_id
      )
      VALUES (
        ${id},
        ${amount},
        ${String(payload?.method || "BANK")
          .trim()
          .toUpperCase()
          .slice(0, 20)},
        ${cleanStr(payload?.reference)},
        ${cleanStr(payload?.note)},
        ${parseDateOrNull(payload?.paidAt) || new Date()},
        ${ownerUserId}
      )
    `);

    await tx.execute(sql`
      UPDATE supplier_bills
      SET
        paid_amount = ${nextPaid},
        status = ${nextStatus},
        updated_at = ${new Date()}
      WHERE id = ${id}
    `);

    await tx.execute(sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description
      )
      VALUES (
        ${existing.locationId},
        ${ownerUserId},
        'OWNER_SUPPLIER_BILL_PAYMENT_CREATE',
        'supplier_bill',
        ${id},
        ${`Owner recorded supplier bill payment on bill #${id}`}
      )
    `);

    return getOwnerSupplierBillById(tx, id);
  });
}

async function voidOwnerSupplierBill({ ownerUserId, billId, reason }) {
  const id = toInt(billId, null);
  if (!id) {
    const err = new Error("Invalid bill id");
    err.code = "BAD_BILL_ID";
    throw err;
  }

  return db.transaction(async (tx) => {
    const existing = await getBillOrThrow(tx, id);
    const currentStatus = normalizeStatus(existing.status);

    if (currentStatus === "VOID") {
      return getOwnerSupplierBillById(tx, id);
    }

    const paid = Math.max(0, Number(existing.paidAmount || 0));
    if (paid > 0) {
      const err = new Error("Cannot void a bill that already has payments");
      err.code = "HAS_PAYMENTS";
      throw err;
    }

    const nextNote = [cleanStr(existing.note), cleanStr(reason)]
      .filter(Boolean)
      .join(" | ");

    await tx.execute(sql`
      UPDATE supplier_bills
      SET
        status = 'VOID',
        note = ${nextNote || existing.note},
        updated_at = ${new Date()}
      WHERE id = ${id}
    `);

    await tx.execute(sql`
      INSERT INTO audit_logs (
        location_id,
        user_id,
        action,
        entity,
        entity_id,
        description
      )
      VALUES (
        ${existing.locationId},
        ${ownerUserId},
        'OWNER_SUPPLIER_BILL_VOID',
        'supplier_bill',
        ${id},
        ${`Owner voided supplier bill #${id}`}
      )
    `);

    return getOwnerSupplierBillById(tx, id);
  });
}

module.exports = {
  createOwnerSupplierBill,
  updateOwnerSupplierBill,
  addOwnerSupplierBillPayment,
  voidOwnerSupplierBill,
};
