const { db } = require("../config/db");
const notificationService = require("./notificationService");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { products } = require("../db/schema/products.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { customers } = require("../db/schema/customers.schema");
const { eq, and, inArray } = require("drizzle-orm");

/**
 * BCS sales flow:
 * - Seller creates sale as DRAFT (no stock movement)
 * - Storekeeper fulfills sale -> deduct inventory -> status becomes FULFILLED
 * - Seller marks PAID -> status becomes AWAITING_PAYMENT_RECORD
 * - Cashier records payment -> sale becomes COMPLETED
 * - Seller creates credit through POST /credits (NOT through /sales/:id/mark)
 *
 * Statuses:
 * - DRAFT
 * - FULFILLED
 * - PENDING                // credit lifecycle status on sale side
 * - APPROVED               // approved credit
 * - PARTIALLY_PAID         // future-ready credit repayment state
 * - AWAITING_PAYMENT_RECORD
 * - COMPLETED
 * - CANCELLED
 */

const PAYMENT_METHODS = new Set(["CASH", "MOMO", "CARD", "BANK", "OTHER"]);

function toInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x;
}

function computeLine({ qty, unitPrice, discountPercent, discountAmount }) {
  const q = toInt(qty);
  const up = toInt(unitPrice);
  const base = up * q;

  const pct = discountPercent == null ? 0 : toPct(discountPercent);
  const pctSafe = clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  const pctDisc = Math.round((base * pctSafe) / 100);

  const amtDisc = toInt(discountAmount);
  const totalDisc = clamp(pctDisc + amtDisc, 0, base);

  return {
    qty: q,
    unitPrice: up,
    base,
    discountPercent: pctSafe,
    discountAmount: amtDisc,
    lineTotal: base - totalDisc,
  };
}

function applySaleDiscount(subtotal, discountPercent, discountAmount) {
  const sub = toInt(subtotal);

  const pct = discountPercent == null ? 0 : toPct(discountPercent);
  const pctSafe = clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  const pctDisc = Math.round((sub * pctSafe) / 100);

  const amtDisc = toInt(discountAmount);
  const totalDisc = clamp(pctDisc + amtDisc, 0, sub);

  return {
    totalAmount: sub - totalDisc,
    discountPercent: pctSafe,
    discountAmount: amtDisc,
  };
}

function normPhone(v) {
  if (v == null) return "";
  return String(v)
    .trim()
    .replace(/[\s\-()]/g, "");
}

function normName(v) {
  if (v == null) return "";
  return String(v).trim();
}

async function createSale({
  locationId,
  sellerId,
  customerId,
  customerName,
  customerPhone,
  note,
  items,
  discountPercent,
  discountAmount,
}) {
  function toNote(v) {
    const s = v == null ? "" : String(v);
    const t = s.trim();
    if (!t) return null;
    return t.slice(0, 200);
  }

  function toId(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  const locId = toId(locationId);
  const sellId = toId(sellerId);

  if (!locId) {
    const err = new Error("Invalid location");
    err.code = "BAD_LOCATION";
    throw err;
  }

  if (!sellId) {
    const err = new Error("Invalid seller");
    err.code = "BAD_SELLER";
    throw err;
  }

  const typedName = normName(customerName);
  const typedPhone = normPhone(customerPhone);
  const incomingCustomerId = toId(customerId);

  const rawItems = Array.isArray(items) ? items : [];
  const ids = [
    ...new Set(rawItems.map((x) => Number(x?.productId)).filter((x) => x > 0)),
  ];

  if (ids.length === 0) {
    const err = new Error("No items");
    err.code = "NO_ITEMS";
    throw err;
  }

  return db.transaction(async (tx) => {
    const prodRows = await tx
      .select()
      .from(products)
      .where(and(eq(products.locationId, locId), inArray(products.id, ids)));

    const prodMap = new Map(prodRows.map((p) => [Number(p.id), p]));

    let strictMaxDisc = 100;
    const lines = [];
    let subtotal = 0;

    for (const it of rawItems) {
      const pid = Number(it?.productId);
      if (!pid) continue;

      const prod = prodMap.get(pid);
      if (!prod) {
        const err = new Error("Product not found");
        err.code = "PRODUCT_NOT_FOUND";
        err.debug = { productId: pid };
        throw err;
      }

      const qty = toInt(it?.qty);
      if (qty <= 0) {
        const err = new Error("Invalid qty");
        err.code = "BAD_QTY";
        err.debug = { productId: pid, qty: it?.qty };
        throw err;
      }

      const sellingPrice = toInt(prod.sellingPrice ?? prod.selling_price ?? 0);
      const requestedUnit =
        it?.unitPrice == null ? sellingPrice : toInt(it.unitPrice);

      if (requestedUnit < 0) {
        const err = new Error("Invalid unit price");
        err.code = "BAD_UNIT_PRICE";
        err.debug = { productId: pid, requestedUnit };
        throw err;
      }

      if (requestedUnit > sellingPrice) {
        const err = new Error("Unit price cannot be above selling price");
        err.code = "PRICE_TOO_HIGH";
        err.debug = { productId: pid, sellingPrice, requestedUnit };
        throw err;
      }

      const itemMax = clamp(
        toPct(prod.maxDiscountPercent ?? prod.max_discount_percent ?? 0),
        0,
        100,
      );
      strictMaxDisc = Math.min(strictMaxDisc, itemMax);

      const itemPct =
        it?.discountPercent == null ? 0 : toPct(it.discountPercent);
      if (itemPct < 0) {
        const err = new Error("Invalid discount percent");
        err.code = "BAD_DISCOUNT_PERCENT";
        err.debug = { productId: pid, discountPercent: itemPct };
        throw err;
      }

      if (itemPct > itemMax) {
        const err = new Error("Discount percent exceeds allowed maximum");
        err.code = "DISCOUNT_TOO_HIGH";
        err.debug = {
          productId: pid,
          requestedDiscountPercent: itemPct,
          maxDiscountPercent: itemMax,
        };
        throw err;
      }

      const line = computeLine({
        qty,
        unitPrice: requestedUnit,
        discountPercent: itemPct,
        discountAmount: it?.discountAmount,
      });

      if (line.lineTotal < 0) {
        const err = new Error("Invalid discount");
        err.code = "BAD_DISCOUNT";
        err.debug = { productId: pid };
        throw err;
      }

      subtotal += line.lineTotal;

      lines.push({
        productId: pid,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      });
    }

    if (!lines.length) {
      const err = new Error("No items");
      err.code = "NO_ITEMS";
      throw err;
    }

    const salePct = discountPercent == null ? 0 : toPct(discountPercent);
    if (salePct < 0) {
      const err = new Error("Invalid sale discount percent");
      err.code = "BAD_SALE_DISCOUNT_PERCENT";
      throw err;
    }

    if (salePct > strictMaxDisc) {
      const err = new Error("Sale discount percent exceeds allowed maximum");
      err.code = "SALE_DISCOUNT_TOO_HIGH";
      err.debug = {
        requestedDiscountPercent: salePct,
        strictMaxDiscountPercent: strictMaxDisc,
      };
      throw err;
    }

    const saleDisc = applySaleDiscount(subtotal, salePct, discountAmount);

    let effectiveCustomerId = incomingCustomerId;

    if (effectiveCustomerId) {
      const rows = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.locationId, locId),
            eq(customers.id, effectiveCustomerId),
          ),
        );

      if (!rows[0]) {
        const err = new Error("Customer not found");
        err.code = "CUSTOMER_NOT_FOUND";
        err.debug = { customerId: effectiveCustomerId };
        throw err;
      }
    } else {
      if (!typedPhone || !typedName) {
        const err = new Error("Customer name and phone are required");
        err.code = "MISSING_CUSTOMER_FIELDS";
        err.debug = { customerName: !!typedName, customerPhone: !!typedPhone };
        throw err;
      }

      const existing = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.locationId, locId), eq(customers.phone, typedPhone)),
        );

      if (existing[0]) {
        effectiveCustomerId = Number(existing[0].id);

        if (typedName && String(existing[0].name || "").trim() !== typedName) {
          await tx
            .update(customers)
            .set({ name: typedName, updatedAt: new Date() })
            .where(eq(customers.id, existing[0].id));
        }
      } else {
        await tx
          .insert(customers)
          .values({
            locationId: locId,
            name: typedName,
            phone: typedPhone,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing();

        const after = await tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.locationId, locId),
              eq(customers.phone, typedPhone),
            ),
          );

        if (!after[0]) {
          const err = new Error("Failed to create customer");
          err.code = "CUSTOMER_CREATE_FAILED";
          throw err;
        }

        effectiveCustomerId = Number(after[0].id);
      }
    }

    const now = new Date();
    const [sale] = await tx
      .insert(sales)
      .values({
        locationId: locId,
        sellerId: sellId,
        customerId: effectiveCustomerId || null,
        customerName: typedName || null,
        customerPhone: typedPhone || null,
        status: "DRAFT",
        totalAmount: saleDisc.totalAmount,
        paymentMethod: null,
        note: toNote(note),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    for (const ln of lines) {
      await tx.insert(saleItems).values({
        saleId: sale.id,
        productId: ln.productId,
        qty: ln.qty,
        unitPrice: ln.unitPrice,
        lineTotal: ln.lineTotal,
      });
    }

    await tx.insert(auditLogs).values({
      locationId: locId,
      userId: sellId,
      action: "SALE_CREATE",
      entity: "sale",
      entityId: sale.id,
      description: `Sale #${sale.id} created (DRAFT), total=${saleDisc.totalAmount}`,
    });

    await notificationService.notifyRoles({
      locationId: locId,
      roles: ["store_keeper"],
      actorUserId: sellId,
      type: "SALE_DRAFT_CREATED",
      title: "Stock release needed",
      body: `A new sale needs stock release (Sale #${sale.id}).`,
      priority: "high",
      entity: "sale",
      entityId: Number(sale.id),
      tx,
    });

    return sale;
  });
}

async function fulfillSale({ locationId, storeKeeperId, saleId, note }) {
  return db.transaction(async (tx) => {
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(sale.status).toUpperCase() !== "DRAFT") {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      err.debug = { current: sale.status, required: "DRAFT" };
      throw err;
    }

    const items = await tx
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId));

    if (!items.length) {
      const err = new Error("Sale has no items");
      err.code = "NO_ITEMS";
      throw err;
    }

    for (const it of items) {
      const pid = Number(it.productId);
      const qty = toInt(it.qty);

      await tx
        .insert(inventoryBalances)
        .values({ locationId, productId: pid, qtyOnHand: 0 })
        .onConflictDoNothing();

      const invRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.locationId, locationId),
            eq(inventoryBalances.productId, pid),
          ),
        );

      const inv = invRows[0];
      const currentQty = toInt(inv?.qtyOnHand);
      const newQty = currentQty - qty;

      if (newQty < 0) {
        const err = new Error("Insufficient inventory stock");
        err.code = "INSUFFICIENT_INVENTORY_STOCK";
        err.debug = { productId: pid, available: currentQty, needed: qty };
        throw err;
      }

      await tx
        .update(inventoryBalances)
        .set({ qtyOnHand: newQty, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryBalances.locationId, locationId),
            eq(inventoryBalances.productId, pid),
          ),
        );
    }

    const [updated] = await tx
      .update(sales)
      .set({
        status: "FULFILLED",
        note: note != null ? note : sale.note,
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId: storeKeeperId,
      action: "SALE_FULFILL",
      entity: "sale",
      entityId: saleId,
      description: `Sale #${saleId} fulfilled (inventory deducted)`,
    });

    return updated;
  });
}

async function markSale({
  locationId,
  saleId,
  status,
  paymentMethod,
  userId,
  sellerId,
  bypassOwnershipCheck = false,
}) {
  return db.transaction(async (tx) => {
    const actorId = Number(userId ?? sellerId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      const err = new Error("Invalid user");
      err.code = "BAD_USER";
      throw err;
    }

    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (!bypassOwnershipCheck && Number(sale.sellerId) !== actorId) {
      const err = new Error("Forbidden");
      err.code = "FORBIDDEN";
      throw err;
    }

    const current = String(sale.status).toUpperCase();
    const allowed = ["FULFILLED", "AWAITING_PAYMENT_RECORD"];
    if (!allowed.includes(current)) {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      err.debug = { current: sale.status, allowed };
      throw err;
    }

    const raw = String(status || "").toUpperCase();

    // Credit is no longer created through salesService.markSale in BCS.
    if (raw === "PENDING" || raw === "CREDIT") {
      const err = new Error("Use POST /credits to create a credit request");
      err.code = "USE_CREDIT_ENDPOINT";
      throw err;
    }

    if (raw !== "PAID") {
      const err = new Error("Invalid sale mark status");
      err.code = "BAD_MARK_STATUS";
      err.debug = { status: raw, allowed: ["PAID"] };
      throw err;
    }

    const nextStatus = "AWAITING_PAYMENT_RECORD";

    const m = String(paymentMethod || "").toUpperCase();
    if (!PAYMENT_METHODS.has(m)) {
      const err = new Error("Invalid payment method");
      err.code = "BAD_PAYMENT_METHOD";
      err.debug = { paymentMethod };
      throw err;
    }
    const methodSafe = m;

    if (current === nextStatus) {
      const existing = String(sale.paymentMethod || "").toUpperCase();
      if (methodSafe && existing !== methodSafe) {
        const [patched] = await tx
          .update(sales)
          .set({ paymentMethod: methodSafe, updatedAt: new Date() })
          .where(eq(sales.id, saleId))
          .returning();

        await tx.insert(auditLogs).values({
          locationId,
          userId: actorId,
          action: "SALE_MARK",
          entity: "sale",
          entityId: saleId,
          description: `Sale #${saleId} payment method updated -> ${methodSafe}`,
        });

        return patched;
      }

      return sale;
    }

    const [updated] = await tx
      .update(sales)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
        paymentMethod: methodSafe,
      })
      .where(eq(sales.id, saleId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId: actorId,
      action: "SALE_MARK",
      entity: "sale",
      entityId: saleId,
      description: `Sale #${saleId} marked PAID -> ${nextStatus} (method=${methodSafe})`,
    });

    await notificationService.notifyRoles({
      locationId,
      roles: ["cashier", "manager"],
      actorUserId: actorId,
      type: "SALE_AWAITING_PAYMENT_RECORD",
      title: `Sale #${saleId} needs payment record`,
      body: `Seller marked this sale as PAID (${methodSafe}). Please record payment to complete.`,
      priority: "high",
      entity: "sale",
      entityId: Number(saleId),
    });

    return updated;
  });
}

async function cancelSale({ locationId, userId, saleId, reason }) {
  return db.transaction(async (tx) => {
    const saleRows = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.locationId, locationId)));

    const sale = saleRows[0];
    if (!sale) {
      const err = new Error("Sale not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (String(sale.status).toUpperCase() === "COMPLETED") {
      const err = new Error("Cannot cancel completed sale");
      err.code = "BAD_STATUS";
      throw err;
    }

    const needsRestore = [
      "FULFILLED",
      "PENDING",
      "APPROVED",
      "PARTIALLY_PAID",
      "AWAITING_PAYMENT_RECORD",
    ].includes(String(sale.status).toUpperCase());

    if (needsRestore) {
      const items = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, saleId));

      for (const it of items) {
        const pid = Number(it.productId);
        const qty = toInt(it.qty);

        await tx
          .insert(inventoryBalances)
          .values({ locationId, productId: pid, qtyOnHand: 0 })
          .onConflictDoNothing();

        const invRows = await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.locationId, locationId),
              eq(inventoryBalances.productId, pid),
            ),
          );

        const inv = invRows[0];
        const restored = toInt(inv?.qtyOnHand) + qty;

        await tx
          .update(inventoryBalances)
          .set({ qtyOnHand: restored, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryBalances.locationId, locationId),
              eq(inventoryBalances.productId, pid),
            ),
          );
      }
    }

    const [updated] = await tx
      .update(sales)
      .set({
        status: "CANCELLED",
        canceledAt: new Date(),
        canceledBy: userId,
        cancelReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId,
      action: "SALE_CANCEL",
      entity: "sale",
      entityId: saleId,
      description: `Sale #${saleId} cancelled. reason=${reason || "-"}`,
    });

    return updated;
  });
}

module.exports = { createSale, fulfillSale, markSale, cancelSale };
