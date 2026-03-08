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

function toInt(v, dflt = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function cleanStr(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function cleanDate(v) {
  const s = cleanStr(v);
  return s || null;
}

function moneyInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function computeTotalsFromItems(items) {
  const safeItems = Array.isArray(items) ? items : [];

  const lines = safeItems.map((it) => {
    const qty = moneyInt(it.qty);
    const unitCost = moneyInt(it.unitCost);
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

  const totalAmount = lines.reduce(
    (sum, line) => sum + Number(line.lineTotal || 0),
    0,
  );

  return { lines, totalAmount };
}

function deriveBillStatus({ totalAmount, paidAmount, requestedStatus }) {
  const total = moneyInt(totalAmount);
  const paid = moneyInt(paidAmount);
  const requested = String(requestedStatus || "")
    .trim()
    .toUpperCase();

  if (requested === "VOID") return "VOID";
  if (paid <= 0) return requested === "DRAFT" ? "DRAFT" : "OPEN";
  if (paid >= total) return "PAID";
  return "PARTIALLY_PAID";
}

function ensurePositiveTotal(totalAmount) {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    const err = new Error("totalAmount must be > 0");
    err.statusCode = 400;
    throw err;
  }
}

async function getSupplierOrThrow(supplierId) {
  const sid = Number(supplierId);
  if (!Number.isInteger(sid) || sid <= 0) {
    const err = new Error("Invalid supplierId");
    err.statusCode = 400;
    throw err;
  }

  const [row] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      isActive: suppliers.isActive,
    })
    .from(suppliers)
    .where(eq(suppliers.id, sid));

  if (!row) {
    const err = new Error("Supplier not found");
    err.statusCode = 404;
    throw err;
  }

  if (!row.isActive) {
    const err = new Error("Supplier is inactive");
    err.statusCode = 409;
    throw err;
  }

  return row;
}

async function getScopedBillOrThrow({ billId, locationId, tx = db }) {
  const id = Number(billId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid bill id");
    err.statusCode = 400;
    throw err;
  }

  const [bill] = await tx
    .select()
    .from(supplierBills)
    .where(
      and(eq(supplierBills.id, id), eq(supplierBills.locationId, locationId)),
    );

  if (!bill) {
    const err = new Error("Bill not found");
    err.statusCode = 404;
    throw err;
  }

  return bill;
}

async function listSupplierBills(req, reply) {
  try {
    const locationId = Number(req.user.locationId);

    const q = String(req.query?.q || "").trim();
    const supplierId = req.query?.supplierId
      ? Number(req.query.supplierId)
      : null;
    const status = String(req.query?.status || "")
      .trim()
      .toUpperCase();
    const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
    const offset = Math.max(0, toInt(req.query?.offset, 0));

    const where = [eq(supplierBills.locationId, locationId)];

    if (supplierId && Number.isInteger(supplierId) && supplierId > 0) {
      where.push(eq(supplierBills.supplierId, supplierId));
    }

    if (status) {
      where.push(eq(supplierBills.status, status));
    }

    if (q) {
      const like = `%${q}%`;
      where.push(sql`(
        ${supplierBills.billNo} ILIKE ${like}
        OR ${supplierBills.note} ILIKE ${like}
        OR ${suppliers.name} ILIKE ${like}
      )`);
    }

    const rows = await db
      .select({
        id: supplierBills.id,
        supplierId: supplierBills.supplierId,
        locationId: supplierBills.locationId,
        supplierName: suppliers.name,
        billNo: supplierBills.billNo,
        currency: supplierBills.currency,
        totalAmount: supplierBills.totalAmount,
        paidAmount: supplierBills.paidAmount,
        balance:
          sql`GREATEST(${supplierBills.totalAmount} - ${supplierBills.paidAmount}, 0)::int`.as(
            "balance",
          ),
        status: supplierBills.status,
        issuedDate: supplierBills.issuedDate,
        dueDate: supplierBills.dueDate,
        note: supplierBills.note,
        createdAt: supplierBills.createdAt,
        isOverdue: sql`
          CASE
            WHEN ${supplierBills.dueDate} IS NOT NULL
             AND ${supplierBills.dueDate} < CURRENT_DATE
             AND ${supplierBills.status} NOT IN ('PAID', 'VOID')
            THEN true
            ELSE false
          END
        `.as("isOverdue"),
        daysOverdue: sql`
          CASE
            WHEN ${supplierBills.dueDate} IS NOT NULL
             AND ${supplierBills.dueDate} < CURRENT_DATE
             AND ${supplierBills.status} NOT IN ('PAID', 'VOID')
            THEN (CURRENT_DATE - ${supplierBills.dueDate})::int
            ELSE 0
          END
        `.as("daysOverdue"),
      })
      .from(supplierBills)
      .leftJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
      .where(and(...where))
      .orderBy(desc(supplierBills.id))
      .limit(limit)
      .offset(offset);

    return reply.send({ bills: rows, limit, offset });
  } catch (e) {
    req.log.error({ err: e }, "listSupplierBills failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function getSupplierBill(req, reply) {
  try {
    const locationId = Number(req.user.locationId);
    const id = Number(req.params?.id);

    const [bill] = await db
      .select({
        id: supplierBills.id,
        supplierId: supplierBills.supplierId,
        locationId: supplierBills.locationId,
        supplierName: suppliers.name,
        billNo: supplierBills.billNo,
        currency: supplierBills.currency,
        totalAmount: supplierBills.totalAmount,
        paidAmount: supplierBills.paidAmount,
        balance:
          sql`GREATEST(${supplierBills.totalAmount} - ${supplierBills.paidAmount}, 0)::int`.as(
            "balance",
          ),
        status: supplierBills.status,
        issuedDate: supplierBills.issuedDate,
        dueDate: supplierBills.dueDate,
        note: supplierBills.note,
        createdByUserId: supplierBills.createdByUserId,
        createdAt: supplierBills.createdAt,
        updatedAt: supplierBills.updatedAt,
        isOverdue: sql`
          CASE
            WHEN ${supplierBills.dueDate} IS NOT NULL
             AND ${supplierBills.dueDate} < CURRENT_DATE
             AND ${supplierBills.status} NOT IN ('PAID', 'VOID')
            THEN true
            ELSE false
          END
        `.as("isOverdue"),
        daysOverdue: sql`
          CASE
            WHEN ${supplierBills.dueDate} IS NOT NULL
             AND ${supplierBills.dueDate} < CURRENT_DATE
             AND ${supplierBills.status} NOT IN ('PAID', 'VOID')
            THEN (CURRENT_DATE - ${supplierBills.dueDate})::int
            ELSE 0
          END
        `.as("daysOverdue"),
      })
      .from(supplierBills)
      .leftJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
      .where(
        and(eq(supplierBills.id, id), eq(supplierBills.locationId, locationId)),
      );

    if (!bill) {
      return reply.status(404).send({ error: "Bill not found" });
    }

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

    return reply.send({ bill, items, payments });
  } catch (e) {
    req.log.error({ err: e }, "getSupplierBill failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function createSupplierBill(req, reply) {
  try {
    const parsed = supplierBillCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues?.[0]?.message || "Invalid payload",
      });
    }

    const locationId =
      parsed.data.locationId != null
        ? Number(parsed.data.locationId)
        : Number(req.user.locationId);

    const supplier = await getSupplierOrThrow(parsed.data.supplierId);

    let totalAmount =
      parsed.data.totalAmount != null ? moneyInt(parsed.data.totalAmount) : 0;
    let lines = [];

    if (Array.isArray(parsed.data.items) && parsed.data.items.length > 0) {
      const computed = computeTotalsFromItems(parsed.data.items);
      totalAmount = computed.totalAmount;
      lines = computed.lines;
    }

    ensurePositiveTotal(totalAmount);

    const initialPayment = parsed.data.initialPayment || null;
    const initialPaidAmount = initialPayment
      ? Math.min(moneyInt(initialPayment.amount), totalAmount)
      : 0;

    const finalStatus = deriveBillStatus({
      totalAmount,
      paidAmount: initialPaidAmount,
      requestedStatus: parsed.data.status,
    });

    const createdByUserId = req.user?.id ? Number(req.user.id) : null;

    const result = await db.transaction(async (tx) => {
      const [bill] = await tx
        .insert(supplierBills)
        .values({
          supplierId: supplier.id,
          locationId,
          billNo: cleanStr(parsed.data.billNo),
          currency: String(parsed.data.currency || "RWF")
            .trim()
            .toUpperCase()
            .slice(0, 8),
          totalAmount,
          paidAmount: initialPaidAmount,
          status: finalStatus,
          issuedDate: cleanDate(parsed.data.issuedDate),
          dueDate: cleanDate(parsed.data.dueDate),
          note: cleanStr(parsed.data.note),
          createdByUserId,
          updatedAt: sql`now()`,
        })
        .returning();

      if (lines.length > 0) {
        await tx.insert(supplierBillItems).values(
          lines.map((x) => ({
            billId: bill.id,
            productId: x.productId || null,
            description: x.description,
            qty: x.qty,
            unitCost: x.unitCost,
            lineTotal: x.lineTotal,
          })),
        );
      }

      if (initialPayment && initialPaidAmount > 0) {
        await tx.insert(supplierBillPayments).values({
          billId: bill.id,
          amount: initialPaidAmount,
          method: String(initialPayment.method).toUpperCase().slice(0, 20),
          reference: cleanStr(initialPayment.reference),
          note: cleanStr(initialPayment.note),
          paidAt: cleanStr(initialPayment.paidAt) || undefined,
          createdByUserId,
        });
      }

      return bill;
    });

    return reply.status(201).send({ bill: result });
  } catch (e) {
    req.log.error({ err: e }, "createSupplierBill failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function updateSupplierBill(req, reply) {
  try {
    const id = Number(req.params?.id);
    const locationId = Number(req.user.locationId);

    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(400).send({ error: "Invalid id" });
    }

    const parsed = supplierBillUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues?.[0]?.message || "Invalid payload",
      });
    }

    const existing = await getScopedBillOrThrow({ billId: id, locationId });

    const currentStatus = String(existing.status || "").toUpperCase();
    if (currentStatus === "PAID" || currentStatus === "VOID") {
      return reply
        .status(409)
        .send({ error: `Bill is ${currentStatus}; editing is locked.` });
    }

    const hasPayments = Number(existing.paidAmount || 0) > 0;
    const wantsStructuralChange =
      parsed.data.billNo !== undefined ||
      parsed.data.currency !== undefined ||
      parsed.data.totalAmount !== undefined ||
      parsed.data.issuedDate !== undefined ||
      parsed.data.items !== undefined ||
      parsed.data.status !== undefined;

    if (hasPayments && wantsStructuralChange) {
      return reply.status(409).send({
        error:
          "Bill already has payment history. Only due date and note can be changed now.",
      });
    }

    let nextTotalAmount = null;
    let lines = null;

    if (Array.isArray(parsed.data.items)) {
      const computed = computeTotalsFromItems(parsed.data.items);
      nextTotalAmount = computed.totalAmount;
      lines = computed.lines;
      ensurePositiveTotal(nextTotalAmount);
    } else if (parsed.data.totalAmount != null) {
      nextTotalAmount = moneyInt(parsed.data.totalAmount);
      ensurePositiveTotal(nextTotalAmount);
    }

    const requestedStatus =
      parsed.data.status != null
        ? String(parsed.data.status).toUpperCase()
        : undefined;

    const nextStatus =
      requestedStatus != null
        ? deriveBillStatus({
            totalAmount:
              nextTotalAmount != null ? nextTotalAmount : existing.totalAmount,
            paidAmount: existing.paidAmount,
            requestedStatus,
          })
        : undefined;

    const [row] = await db
      .update(supplierBills)
      .set({
        ...(parsed.data.billNo !== undefined
          ? { billNo: cleanStr(parsed.data.billNo) }
          : {}),
        ...(parsed.data.currency !== undefined
          ? {
              currency: String(parsed.data.currency)
                .trim()
                .toUpperCase()
                .slice(0, 8),
            }
          : {}),
        ...(nextTotalAmount != null ? { totalAmount: nextTotalAmount } : {}),
        ...(parsed.data.issuedDate !== undefined
          ? { issuedDate: cleanDate(parsed.data.issuedDate) }
          : {}),
        ...(parsed.data.dueDate !== undefined
          ? { dueDate: cleanDate(parsed.data.dueDate) }
          : {}),
        ...(parsed.data.note !== undefined
          ? { note: cleanStr(parsed.data.note) }
          : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(supplierBills.id, id), eq(supplierBills.locationId, locationId)),
      )
      .returning();

    if (!row) {
      return reply.status(404).send({ error: "Bill not found" });
    }

    if (lines) {
      await db
        .delete(supplierBillItems)
        .where(eq(supplierBillItems.billId, id));

      if (lines.length > 0) {
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
  } catch (e) {
    req.log.error({ err: e }, "updateSupplierBill failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function deleteSupplierBill(req, reply) {
  try {
    const id = Number(req.params?.id);
    const locationId = Number(req.user.locationId);

    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(400).send({ error: "Invalid id" });
    }

    const bill = await getScopedBillOrThrow({ billId: id, locationId });

    if (Number(bill.paidAmount || 0) > 0) {
      return reply.status(409).send({
        error: "Bill already has payment history. Void is blocked.",
      });
    }

    const [row] = await db
      .update(supplierBills)
      .set({
        status: "VOID",
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(supplierBills.id, id), eq(supplierBills.locationId, locationId)),
      )
      .returning();

    if (!row) {
      return reply.status(404).send({ error: "Bill not found" });
    }

    return reply.send({ ok: true });
  } catch (e) {
    req.log.error({ err: e }, "deleteSupplierBill failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function createSupplierBillPayment(req, reply) {
  try {
    const id = Number(req.params?.id);
    const locationId = Number(req.user.locationId);

    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(400).send({ error: "Invalid id" });
    }

    const parsed = supplierBillPaymentCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues?.[0]?.message || "Invalid payload",
      });
    }

    const amount = moneyInt(parsed.data.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return reply.status(400).send({ error: "Invalid amount" });
    }

    const createdByUserId = req.user?.id ? Number(req.user.id) : null;

    const result = await db.transaction(async (tx) => {
      const bill = await getScopedBillOrThrow({ billId: id, locationId, tx });

      const currentStatus = String(bill.status || "").toUpperCase();
      if (currentStatus === "VOID") {
        const err = new Error("Bill is VOID");
        err.statusCode = 409;
        throw err;
      }
      if (currentStatus === "PAID") {
        const err = new Error("Bill is already fully paid");
        err.statusCode = 409;
        throw err;
      }

      const total = Number(bill.totalAmount || 0);
      const paid = Number(bill.paidAmount || 0);
      const balance = Math.max(0, total - paid);

      if (amount > balance) {
        const err = new Error(`Payment exceeds balance (${balance}).`);
        err.statusCode = 409;
        throw err;
      }

      const [payment] = await tx
        .insert(supplierBillPayments)
        .values({
          billId: id,
          amount,
          method: String(parsed.data.method).toUpperCase().slice(0, 20),
          reference: cleanStr(parsed.data.reference),
          note: cleanStr(parsed.data.note),
          paidAt: cleanStr(parsed.data.paidAt) || undefined,
          createdByUserId,
        })
        .returning();

      const newPaid = paid + amount;
      const newStatus = deriveBillStatus({
        totalAmount: total,
        paidAmount: newPaid,
        requestedStatus: currentStatus,
      });

      await tx
        .update(supplierBills)
        .set({
          paidAmount: newPaid,
          status: newStatus,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(supplierBills.id, id),
            eq(supplierBills.locationId, locationId),
          ),
        );

      return {
        payment,
        bill: {
          id,
          paidAmount: newPaid,
          balance: Math.max(0, total - newPaid),
          status: newStatus,
        },
      };
    });

    return reply.status(201).send(result);
  } catch (e) {
    req.log.error({ err: e }, "createSupplierBillPayment failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
}

async function supplierSummary(req, reply) {
  try {
    const locationId = Number(req.user.locationId);
    const supplierId = req.query?.supplierId
      ? Number(req.query.supplierId)
      : null;

    const where = [eq(supplierBills.locationId, locationId)];
    if (supplierId && Number.isInteger(supplierId) && supplierId > 0) {
      where.push(eq(supplierBills.supplierId, supplierId));
    }
    where.push(sql`${supplierBills.status} <> 'VOID'`);

    const rows = await db
      .select({
        billsCount: sql`count(*)::int`.as("billsCount"),
        totalAmount:
          sql`coalesce(sum(${supplierBills.totalAmount}), 0)::int`.as(
            "totalAmount",
          ),
        paidAmount: sql`coalesce(sum(${supplierBills.paidAmount}), 0)::int`.as(
          "paidAmount",
        ),
        openBillsCount:
          sql`count(*) filter (where ${supplierBills.status} = 'OPEN')::int`.as(
            "openBillsCount",
          ),
        partiallyPaidCount:
          sql`count(*) filter (where ${supplierBills.status} = 'PARTIALLY_PAID')::int`.as(
            "partiallyPaidCount",
          ),
        paidBillsCount:
          sql`count(*) filter (where ${supplierBills.status} = 'PAID')::int`.as(
            "paidBillsCount",
          ),
        overdueBillsCount: sql`count(*) filter (
          where ${supplierBills.dueDate} is not null
            and ${supplierBills.dueDate} < CURRENT_DATE
            and ${supplierBills.status} not in ('PAID', 'VOID')
        )::int`.as("overdueBillsCount"),
        overdueAmount: sql`coalesce(sum(
          case
            when ${supplierBills.dueDate} is not null
             and ${supplierBills.dueDate} < CURRENT_DATE
             and ${supplierBills.status} not in ('PAID', 'VOID')
            then greatest(${supplierBills.totalAmount} - ${supplierBills.paidAmount}, 0)
            else 0
          end
        ), 0)::int`.as("overdueAmount"),
      })
      .from(supplierBills)
      .where(and(...where));

    const r = rows?.[0] || {
      billsCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      openBillsCount: 0,
      partiallyPaidCount: 0,
      paidBillsCount: 0,
      overdueBillsCount: 0,
      overdueAmount: 0,
    };

    const balance = Math.max(
      0,
      Number(r.totalAmount || 0) - Number(r.paidAmount || 0),
    );

    return reply.send({
      summary: {
        billsCount: Number(r.billsCount || 0),
        totalAmount: Number(r.totalAmount || 0),
        paidAmount: Number(r.paidAmount || 0),
        balance,
        openBillsCount: Number(r.openBillsCount || 0),
        partiallyPaidCount: Number(r.partiallyPaidCount || 0),
        paidBillsCount: Number(r.paidBillsCount || 0),
        overdueBillsCount: Number(r.overdueBillsCount || 0),
        overdueAmount: Number(r.overdueAmount || 0),
      },
    });
  } catch (e) {
    req.log.error({ err: e }, "supplierSummary failed");
    return reply
      .status(e.statusCode || 500)
      .send({ error: e.message || "Internal Server Error" });
  }
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
