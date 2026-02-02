// backend/src/services/salesService.js
const { db } = require("../config/db");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { products } = require("../db/schema/products.schema");
const { sellerHoldings } = require("../db/schema/seller_holdings.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, inArray, sql } = require("drizzle-orm");

/**
 * Phase 1 rules (locked):
 * - Seller creates sale as DRAFT.
 * - Seller marks PAID/PENDING -> status changes + stock deducted (inventory + seller holdings).
 * - Cashier records payment -> sale becomes COMPLETED.
 *
 * Discounts:
 * - Seller can discount but NOT above product.maxDiscountPercent.
 * - Seller cannot increase unit price above product.sellingPrice.
 * - Sale-level discountPercent must also obey the strictest maxDiscountPercent among items (simple + safe).
 */

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
  const lineTotal = base - totalDisc;

  return {
    qty: q,
    unitPrice: up,
    base,
    discountPercent: pctSafe,
    discountAmount: amtDisc,
    lineTotal,
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

    // Load all products at once (location-safe)
    const prodRows = await tx
      .select()
      .from(products)
      .where(
        and(eq(products.locationId, locationId), inArray(products.id, ids)),
      );

    const prodMap = new Map(prodRows.map((p) => [Number(p.id), p]));

    // We enforce sale-level discount <= strictest max among items
    let strictMaxDisc = 100;

    // Build lines + compute subtotal
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

      // ✅ Enforce per-item max discount percent
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

    // ✅ Enforce sale-level discount percent too (safe + simple)
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

    // 1) Insert sale (DRAFT)
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
        note: note ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 2) Insert sale items with required fields
    for (const ln of lines) {
      await tx.insert(saleItems).values({
        saleId: sale.id,
        productId: ln.productId,
        qty: ln.qty,
        unitPrice: ln.unitPrice,
        lineTotal: ln.lineTotal,
      });
    }

    // 3) Audit ✅ FIX: include locationId
    await tx.insert(auditLogs).values({
      locationId, // ✅ required by DB
      userId: sellerId,
      action: "SALE_CREATE",
      entity: "sale",
      entityId: sale.id,
      description: `Sale #${sale.id} created (DRAFT), total=${saleDisc.totalAmount}`,
    });

    return sale;
  });
}

async function markSale({ locationId, sellerId, saleId, status }) {
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

    if (Number(sale.sellerId) !== Number(sellerId)) {
      const err = new Error("Forbidden");
      err.code = "FORBIDDEN";
      throw err;
    }

    if (sale.status !== "DRAFT") {
      const err = new Error("Invalid status");
      err.code = "BAD_STATUS";
      err.debug = { current: sale.status };
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
        .insert(sellerHoldings)
        .values({ locationId, sellerId, productId: pid, qtyOnHand: 0 })
        .onConflictDoNothing();

      const holdRows = await tx
        .select()
        .from(sellerHoldings)
        .where(
          and(
            eq(sellerHoldings.locationId, locationId),
            eq(sellerHoldings.sellerId, sellerId),
            eq(sellerHoldings.productId, pid),
          ),
        );

      const holding = holdRows[0];
      const newHoldQty = toInt(holding?.qtyOnHand) - qty;
      if (newHoldQty < 0) {
        const err = new Error("Insufficient seller stock");
        err.code = "INSUFFICIENT_SELLER_STOCK";
        err.debug = {
          productId: pid,
          holding: holding?.qtyOnHand,
          needed: qty,
        };
        throw err;
      }

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
      const newInvQty = toInt(inv?.qtyOnHand) - qty;
      if (newInvQty < 0) {
        const err = new Error("Insufficient inventory stock");
        err.code = "INSUFFICIENT_INVENTORY_STOCK";
        err.debug = { productId: pid, inventory: inv?.qtyOnHand, needed: qty };
        throw err;
      }

      await tx
        .update(sellerHoldings)
        .set({ qtyOnHand: newHoldQty, updatedAt: new Date() })
        .where(
          and(
            eq(sellerHoldings.locationId, locationId),
            eq(sellerHoldings.sellerId, sellerId),
            eq(sellerHoldings.productId, pid),
          ),
        );

      await tx
        .update(inventoryBalances)
        .set({ qtyOnHand: newInvQty, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryBalances.locationId, locationId),
            eq(inventoryBalances.productId, pid),
          ),
        );
    }

    const nextStatus =
      String(status).toUpperCase() === "PAID"
        ? "AWAITING_PAYMENT_RECORD"
        : "PENDING";

    const [updated] = await tx
      .update(sales)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    // Audit ✅ FIX: include locationId
    await tx.insert(auditLogs).values({
      locationId, // ✅ required by DB
      userId: sellerId,
      action: "SALE_MARK",
      entity: "sale",
      entityId: saleId,
      description: `Sale #${saleId} marked ${status} -> ${nextStatus} (stock deducted)`,
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

    if (sale.status === "COMPLETED") {
      const err = new Error("Cannot cancel completed sale");
      err.code = "BAD_STATUS";
      throw err;
    }

    const needsRestore = ["PENDING", "AWAITING_PAYMENT_RECORD"].includes(
      String(sale.status),
    );

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

        await tx.execute(sql`
          UPDATE inventory_balances
          SET qty_on_hand = qty_on_hand + ${qty},
              updated_at = now()
          WHERE location_id = ${locationId}
            AND product_id = ${pid}
        `);

        await tx
          .insert(sellerHoldings)
          .values({
            locationId,
            sellerId: sale.sellerId,
            productId: pid,
            qtyOnHand: 0,
          })
          .onConflictDoNothing();

        await tx.execute(sql`
          UPDATE seller_holdings
          SET qty_on_hand = qty_on_hand + ${qty},
              updated_at = now()
          WHERE location_id = ${locationId}
            AND seller_id = ${sale.sellerId}
            AND product_id = ${pid}
        `);
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

    // Audit ✅ FIX: include locationId
    await tx.insert(auditLogs).values({
      locationId, // ✅ required by DB
      userId,
      action: "SALE_CANCEL",
      entity: "sale",
      entityId: saleId,
      description: `Sale #${saleId} cancelled. reason=${reason || "-"}`,
    });

    return updated;
  });
}

module.exports = { createSale, markSale, cancelSale };
