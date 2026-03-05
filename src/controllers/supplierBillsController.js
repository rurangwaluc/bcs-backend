const { db } = require("../config/db");
const { suppliers } = require("../db/schema/suppliers.schema");
const {
  supplierBills,
  supplierBillItems,
  supplierBillPayments,
} = require("../db/schema/supplierBills.schema");
const {
  supplierBillCreateSchema,
  supplierBillUpdateSchema,
  supplierBillPaymentCreateSchema,
} = require("../validators/supplierBills.schema");

const { and, desc, eq, sql } = require("drizzle-orm");

function toInt(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function computeTotalsFromItems(items) {
  const clean = Array.isArray(items) ? items : [];
  const lines = clean.map((it) => {
    const qty = Math.max(0, Math.trunc(Number(it.qty) || 0));
    const unitCost = Math.max(0, Math.trunc(Number(it.unitCost) || 0));
    const lineTotal = qty * unitCost;
    return {
      productId:
        it.productId != null
          ? Math.trunc(Number(it.productId) || 0) || null
          : null,
      description: String(it.description || "").trim() || "Item",
      qty,
      unitCost,
      lineTotal,
    };
  });

  const total = lines.reduce((a, x) => a + (Number(x.lineTotal) || 0), 0);
  return { total, lines };
}

async function listSupplierBills(req, reply) {
  const q = String(req.query?.q || "").trim();
  const supplierId = req.query?.supplierId
    ? Number(req.query.supplierId)
    : null;
  const status = String(req.query?.status || "")
    .trim()
    .toUpperCase();
  const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
  const offset = Math.max(0, toInt(req.query?.offset, 0));

  const where = [];
  if (supplierId && Number.isInteger(supplierId) && supplierId > 0) {
    where.push(eq(supplierBills.supplierId, supplierId));
  }
  if (status) {
    where.push(eq(supplierBills.status, status));
  }
  if (q) {
    const like = `%${q}%`;
    where.push(
      sql`(
        ${supplierBills.billNo} ILIKE ${like}
        OR ${supplierBills.note} ILIKE ${like}
      )`,
    );
  }

  // join to suppliers for display
  const rows = await db
    .select({
      id: supplierBills.id,
      supplierId: supplierBills.supplierId,
      supplierName: suppliers.name,
      billNo: supplierBills.billNo,
      currency: supplierBills.currency,
      totalAmount: supplierBills.totalAmount,
      paidAmount: supplierBills.paidAmount,
      status: supplierBills.status,
      issuedDate: supplierBills.issuedDate,
      dueDate: supplierBills.dueDate,
      note: supplierBills.note,
      createdAt: supplierBills.createdAt,
    })
    .from(supplierBills)
    .leftJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierBills.id))
    .limit(limit)
    .offset(offset);

  return reply.send({ bills: rows, limit, offset });
}

async function getSupplierBill(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  const [bill] = await db
    .select({
      id: supplierBills.id,
      supplierId: supplierBills.supplierId,
      supplierName: suppliers.name,
      billNo: supplierBills.billNo,
      currency: supplierBills.currency,
      totalAmount: supplierBills.totalAmount,
      paidAmount: supplierBills.paidAmount,
      status: supplierBills.status,
      issuedDate: supplierBills.issuedDate,
      dueDate: supplierBills.dueDate,
      note: supplierBills.note,
      createdByUserId: supplierBills.createdByUserId,
      createdAt: supplierBills.createdAt,
      updatedAt: supplierBills.updatedAt,
    })
    .from(supplierBills)
    .leftJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .where(eq(supplierBills.id, id));

  if (!bill) return reply.status(404).send({ error: "Bill not found" });

  const items = await db
    .select()
    .from(supplierBillItems)
    .where(eq(supplierBillItems.billId, id))
    .orderBy(desc(supplierBillItems.id));

  const payments = await db
    .select()
    .from(supplierBillPayments)
    .where(eq(supplierBillPayments.billId, id))
    .orderBy(desc(supplierBillPayments.id));

  const balance = Math.max(
    0,
    Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0),
  );

  return reply.send({ bill: { ...bill, balance }, items, payments });
}

async function createSupplierBill(req, reply) {
  const parsed = supplierBillCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }

  const b = parsed.data;

  // Must have supplier
  const sid = Number(b.supplierId);
  const [sup] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, sid));
  if (!sup) return reply.status(400).send({ error: "Supplier not found" });

  // Compute totals from items if present
  let totalAmount =
    b.totalAmount != null ? Math.trunc(Number(b.totalAmount) || 0) : 0;
  let lines = [];
  if (Array.isArray(b.items) && b.items.length) {
    const computed = computeTotalsFromItems(b.items);
    totalAmount = computed.total;
    lines = computed.lines;
  }
  if (!Number.isInteger(totalAmount) || totalAmount < 0) totalAmount = 0;
  if (totalAmount <= 0) {
    return reply
      .status(400)
      .send({ error: "totalAmount must be > 0 (or provide items)" });
  }

  const [row] = await db
    .insert(supplierBills)
    .values({
      supplierId: sid,
      billNo: b.billNo,
      currency: (b.currency || "RWF").toUpperCase().slice(0, 8),
      totalAmount,
      paidAmount: 0,
      status: (b.status || "OPEN").toUpperCase(),
      issuedDate: b.issuedDate ? b.issuedDate : undefined,
      dueDate: b.dueDate ? b.dueDate : undefined,
      note: b.note,
      createdByUserId: req.user?.id ? Number(req.user.id) : null,
      updatedAt: sql`now()`,
    })
    .returning();

  // Insert items
  if (lines.length) {
    await db.insert(supplierBillItems).values(
      lines.map((x) => ({
        billId: row.id,
        productId: x.productId || null,
        description: x.description,
        qty: x.qty,
        unitCost: x.unitCost,
        lineTotal: x.lineTotal,
      })),
    );
  }

  return reply.status(201).send({ bill: row });
}

async function updateSupplierBill(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  const parsed = supplierBillUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }
  const b = parsed.data;

  // Load existing
  const [existing] = await db
    .select()
    .from(supplierBills)
    .where(eq(supplierBills.id, id));
  if (!existing) return reply.status(404).send({ error: "Bill not found" });

  // For safety: once PAID or VOID, lock edits.
  const st = String(existing.status || "").toUpperCase();
  if (st === "PAID" || st === "VOID") {
    return reply
      .status(409)
      .send({ error: `Bill is ${st}; editing is locked.` });
  }

  // Items update: simplest is replace-all
  let totalAmount =
    b.totalAmount != null ? Math.trunc(Number(b.totalAmount) || 0) : null;
  let lines = null;
  if (Array.isArray(b.items)) {
    const computed = computeTotalsFromItems(b.items);
    totalAmount = computed.total;
    lines = computed.lines;
  }
  if (
    totalAmount != null &&
    (!Number.isInteger(totalAmount) || totalAmount <= 0)
  ) {
    return reply.status(400).send({ error: "totalAmount must be > 0" });
  }

  const nextStatus = b.status ? String(b.status).toUpperCase() : undefined;

  const [row] = await db
    .update(supplierBills)
    .set({
      ...(b.billNo !== undefined ? { billNo: b.billNo } : {}),
      ...(b.currency !== undefined
        ? { currency: String(b.currency).toUpperCase().slice(0, 8) }
        : {}),
      ...(totalAmount != null ? { totalAmount } : {}),
      ...(b.issuedDate !== undefined
        ? { issuedDate: b.issuedDate || null }
        : {}),
      ...(b.dueDate !== undefined ? { dueDate: b.dueDate || null } : {}),
      ...(b.note !== undefined ? { note: b.note } : {}),
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(supplierBills.id, id))
    .returning();

  if (!row) return reply.status(404).send({ error: "Bill not found" });

  if (lines) {
    await db.delete(supplierBillItems).where(eq(supplierBillItems.billId, id));
    if (lines.length) {
      await db.insert(supplierBillItems).values(
        lines.map((x) => ({
          billId: id,
          productId: x.productId || null,
          description: x.description,
          qty: x.qty,
          unitCost: x.unitCost,
          lineTotal: x.lineTotal,
        })),
      );
    }
  }

  return reply.send({ bill: row });
}

async function deleteSupplierBill(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  // Soft delete via status
  const [row] = await db
    .update(supplierBills)
    .set({ status: "VOID", updatedAt: sql`now()` })
    .where(eq(supplierBills.id, id))
    .returning();

  if (!row) return reply.status(404).send({ error: "Bill not found" });
  return reply.send({ ok: true });
}

async function createSupplierBillPayment(req, reply) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0)
    return reply.status(400).send({ error: "Invalid id" });

  const parsed = supplierBillPaymentCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return reply
      .status(400)
      .send({ error: parsed.error.issues?.[0]?.message || "Invalid payload" });
  }
  const b = parsed.data;

  const [bill] = await db
    .select()
    .from(supplierBills)
    .where(eq(supplierBills.id, id));
  if (!bill) return reply.status(404).send({ error: "Bill not found" });

  const st = String(bill.status || "").toUpperCase();
  if (st === "VOID") return reply.status(409).send({ error: "Bill is VOID" });

  const amount = Math.trunc(Number(b.amount) || 0);
  if (!Number.isInteger(amount) || amount <= 0)
    return reply.status(400).send({ error: "Invalid amount" });

  const total = Number(bill.totalAmount || 0);
  const paid = Number(bill.paidAmount || 0);
  const balance = Math.max(0, total - paid);
  if (amount > balance) {
    return reply
      .status(409)
      .send({ error: `Payment exceeds balance (${balance}).` });
  }

  const [pay] = await db
    .insert(supplierBillPayments)
    .values({
      billId: id,
      amount,
      method: String(b.method).toUpperCase().slice(0, 20),
      reference: b.reference,
      note: b.note,
      paidAt: b.paidAt ? b.paidAt : undefined,
      createdByUserId: req.user?.id ? Number(req.user.id) : null,
    })
    .returning();

  const newPaid = paid + amount;
  const newStatus =
    newPaid >= total ? "PAID" : st === "DRAFT" ? "OPEN" : st || "OPEN";

  await db
    .update(supplierBills)
    .set({ paidAmount: newPaid, status: newStatus, updatedAt: sql`now()` })
    .where(eq(supplierBills.id, id));

  return reply
    .status(201)
    .send({
      payment: pay,
      bill: { id, paidAmount: newPaid, status: newStatus },
    });
}

async function supplierSummary(req, reply) {
  // Simple totals: open balance + open bills count
  const supplierId = req.query?.supplierId
    ? Number(req.query.supplierId)
    : null;

  const where = [];
  if (supplierId && Number.isInteger(supplierId) && supplierId > 0) {
    where.push(eq(supplierBills.supplierId, supplierId));
  }
  where.push(sql`${supplierBills.status} <> 'VOID'`);

  const rows = await db
    .select({
      billsCount: sql`count(*)::int`.as("billsCount"),
      totalAmount: sql`coalesce(sum(${supplierBills.totalAmount}), 0)::int`.as(
        "totalAmount",
      ),
      paidAmount: sql`coalesce(sum(${supplierBills.paidAmount}), 0)::int`.as(
        "paidAmount",
      ),
    })
    .from(supplierBills)
    .where(and(...where));

  const r = rows?.[0] || { billsCount: 0, totalAmount: 0, paidAmount: 0 };
  const balance = Math.max(
    0,
    Number(r.totalAmount || 0) - Number(r.paidAmount || 0),
  );

  return reply.send({
    summary: {
      billsCount: Number(r.billsCount || 0) || 0,
      totalAmount: Number(r.totalAmount || 0) || 0,
      paidAmount: Number(r.paidAmount || 0) || 0,
      balance,
    },
  });
}

module.exports = {
  listSupplierBills,
  getSupplierBill,
  createSupplierBill,
  updateSupplierBill,
  deleteSupplierBill,
  createSupplierBillPayment,
  supplierSummary,
};
