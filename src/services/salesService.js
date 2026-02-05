// backend/src/services/salesService.js
const { db } = require("../config/db");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { products } = require("../db/schema/products.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, inArray } = require("drizzle-orm");

/**
 * Option B (NO holdings):
 * - Seller creates sale as DRAFT (no stock movement)
 * - Storekeeper fulfills sale -> deduct inventory -> status becomes FULFILLED
 * - Seller marks PAID/PENDING -> status changes (NO stock movement here)
 *
 * Statuses:
 * - DRAFT
 * - FULFILLED
 * - PENDING                (UI shows CREDIT)
 * - AWAITING_PAYMENT_RECORD
 * - COMPLETED
 * - CANCELLED
 */

// Strict payment methods for seller marking PAID
const PAYMENT_METHODS = new Set(["CASH", "MOMO", "BANK"]);

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
  return db.transaction(async (tx) => {
    const ids = [
      ...new Set((items || []).map((x) => Number(x.productId)).filter(Boolean)),
    ];
    if (ids.length === 0) {
      const err = new Error("No items");
      err.code = "NO_ITEMS";
      throw err;
    }

    const prodRows = await tx
      .select()
      .from(products)
      .where(
        and(eq(products.locationId, locationId), inArray(products.id, ids)),
      );

    const prodMap = new Map(prodRows.map((p) => [Number(p.id), p]));

    let strictMaxDisc = 100;
    const lines = [];
    let subtotal = 0;

    for (const it of items) {
      const pid = Number(it.productId);
      const prod = prodMap.get(pid);
      if (!prod) {
        const err = new Error("Product not found");
        err.code = "PRODUCT_NOT_FOUND";
        err.debug = { productId: pid };
        throw err;
      }

      const qty = toInt(it.qty);
      if (qty <= 0) {
        const err = new Error("Invalid qty");
        err.code = "BAD_QTY";
        throw err;
      }

      const sellingPrice = toInt(prod.sellingPrice);
      const requestedUnit =
        it.unitPrice == null ? sellingPrice : toInt(it.unitPrice);

      if (requestedUnit > sellingPrice) {
        const err = new Error("Unit price cannot be above selling price");
        err.code = "PRICE_TOO_HIGH";
        err.debug = { productId: pid, sellingPrice, requestedUnit };
        throw err;
      }

      const itemMax = clamp(toPct(prod.maxDiscountPercent ?? 0), 0, 100);
      strictMaxDisc = Math.min(strictMaxDisc, itemMax);

      const itemPct =
        it.discountPercent == null ? 0 : toPct(it.discountPercent);

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
        discountAmount: it.discountAmount,
      });

      if (line.lineTotal < 0) {
        const err = new Error("Invalid discount");
        err.code = "BAD_DISCOUNT";
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

    const salePct = discountPercent == null ? 0 : toPct(discountPercent);
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

    const [sale] = await tx
      .insert(sales)
      .values({
        locationId,
        sellerId,
        customerId: customerId || null,
        customerName: customerName ?? null,
        customerPhone: customerPhone ?? null,
        status: "DRAFT",
        totalAmount: saleDisc.totalAmount,
        paymentMethod: null, // keep null at draft time
        note: note ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
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
      locationId,
      userId: sellerId,
      action: "SALE_CREATE",
      entity: "sale",
      entityId: sale.id,
      description: `Sale #${sale.id} created (DRAFT), total=${saleDisc.totalAmount}`,
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

/**
 * ✅ Seller finalizes AFTER fulfill:
 * - If status=PAID => sale.status -> AWAITING_PAYMENT_RECORD AND persist paymentMethod
 * - If status=PENDING => sale.status -> PENDING AND clear paymentMethod
 */
async function markSale({
  locationId,
  saleId,
  status,
  paymentMethod,
  userId, // controller uses this
  sellerId, // support old callers
}) {
  return db.transaction(async (tx) => {
    const actorId = Number(sellerId ?? userId);
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

    if (Number(sale.sellerId) !== actorId) {
      const err = new Error("Forbidden");
      err.code = "FORBIDDEN";
      throw err;
    }

    const current = String(sale.status).toUpperCase();
    const allowed = ["FULFILLED", "PENDING", "AWAITING_PAYMENT_RECORD"];
    if (!allowed.includes(current)) {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      err.debug = { current: sale.status, allowed };
      throw err;
    }

    const raw = String(status || "").toUpperCase();
    const nextStatus = raw === "PAID" ? "AWAITING_PAYMENT_RECORD" : "PENDING";

    // Validate + normalize method for PAID
    let methodSafe = null;
    if (raw === "PAID") {
      const m = String(paymentMethod || "").toUpperCase();
      if (!PAYMENT_METHODS.has(m)) {
        const err = new Error("Invalid payment method");
        err.code = "BAD_PAYMENT_METHOD";
        err.debug = { paymentMethod };
        throw err;
      }
      methodSafe = m;
    }

    // If already in target status, still ensure method consistency for paid-like
    if (current === nextStatus) {
      if (nextStatus === "AWAITING_PAYMENT_RECORD") {
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
      }
      return sale;
    }

    const patch = {
      status: nextStatus,
      updatedAt: new Date(),
      paymentMethod:
        nextStatus === "AWAITING_PAYMENT_RECORD" ? methodSafe : null,
    };

    const [updated] = await tx
      .update(sales)
      .set(patch)
      .where(eq(sales.id, saleId))
      .returning();

    await tx.insert(auditLogs).values({
      locationId,
      userId: actorId,
      action: "SALE_MARK",
      entity: "sale",
      entityId: saleId,
      description:
        nextStatus === "AWAITING_PAYMENT_RECORD"
          ? `Sale #${saleId} marked PAID -> ${nextStatus} (method=${methodSafe})`
          : `Sale #${saleId} marked CREDIT -> ${nextStatus}`,
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
