// backend/src/services/salesService.js
const { db } = require("../config/db");
const { sales } = require("../db/schema/sales.schema");
const { saleItems } = require("../db/schema/sale_items.schema");
const { products } = require("../db/schema/products.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { credits } = require("../db/schema/credits.schema");
const { customers } = require("../db/schema/customers.schema");
const { eq, and, inArray, sql } = require("drizzle-orm");

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

// salesService.js (add helpers near top if not present)
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
  // -------------------------
  // Local helpers (stay inside to avoid mismatch)
  // -------------------------
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

  // If caller did not provide customerId, enforce phone+name for auto-create/link
  // (You can relax this later if you want anonymous walk-in customers.)
  const incomingCustomerId = toId(customerId);

  // items validation early
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
    // -------------------------
    // 1) Load products
    // -------------------------
    const prodRows = await tx
      .select()
      .from(products)
      .where(and(eq(products.locationId, locId), inArray(products.id, ids)));

    const prodMap = new Map(prodRows.map((p) => [Number(p.id), p]));

    // -------------------------
    // 2) Build lines + totals (enforce discount rules)
    // -------------------------
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

      // Unit price: default to sellingPrice if not provided
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

    // -------------------------
    // 3) Resolve customer (prefer explicit customerId; else find-or-create by phone)
    // -------------------------
    let effectiveCustomerId = incomingCustomerId;

    // If caller provided customerId, verify it belongs to location
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
      // No customerId => we can link/create by phone
      if (!typedPhone || !typedName) {
        // keep it strict because your CREDIT flow requires customer linkage
        const err = new Error("Customer name and phone are required");
        err.code = "MISSING_CUSTOMER_FIELDS";
        err.debug = { customerName: !!typedName, customerPhone: !!typedPhone };
        throw err;
      }

      // Find by phone (location scoped)
      const existing = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.locationId, locId), eq(customers.phone, typedPhone)),
        );

      if (existing[0]) {
        effectiveCustomerId = Number(existing[0].id);

        // Optionally update name if improved
        if (typedName && String(existing[0].name || "").trim() !== typedName) {
          await tx
            .update(customers)
            .set({ name: typedName, updatedAt: new Date() })
            .where(eq(customers.id, existing[0].id));
        }
      } else {
        // Create customer (race-safe: if unique exists on (locationId, phone), this will avoid duplicates)
        // 1) attempt insert
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

        // 2) re-select (works whether inserted by us or another concurrent request)
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

    // -------------------------
    // 4) Insert sale + items
    // -------------------------
    const now = new Date();
    const [sale] = await tx
      .insert(sales)
      .values({
        locationId: locId,
        sellerId: sellId,

        customerId: effectiveCustomerId || null,

        // Snapshot fields (normalized)
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
 *
 * ✅ CREDIT rule:
 * - When seller marks CREDIT (PENDING), the system auto-creates a credit row
 * - Uses DB unique index (location_id, sale_id) to avoid duplicates
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

    // Only the seller who created it can mark
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

    // Validate + normalize method ONLY for PAID
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

    // Update sale status + paymentMethod (only set when PAID)
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

    /**
     * ✅ If marked CREDIT (PENDING), auto-create credit row.
     * Lock: credit must have customerId, so sale must be linked to a customer.
     */
    if (nextStatus === "PENDING") {
      if (!sale.customerId) {
        const err = new Error(
          "Credit requires a customer. Select/create customer first.",
        );
        err.code = "MISSING_CUSTOMER";
        throw err;
      }

      // ✅ Race-safe: rely on unique index (location_id, sale_id)
      // Your schema already has:
      // uniqueIndex("credits_sale_location_unique").on(t.locationId, t.saleId)
      await tx
        .insert(credits)
        .values({
          locationId,
          saleId,
          customerId: sale.customerId,
          amount: sale.totalAmount,
          status: "OPEN",
          createdBy: actorId,
          note: sale.note ?? null,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }

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
