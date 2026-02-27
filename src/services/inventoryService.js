// backend/src/services/inventoryService.js

const { db } = require("../config/db");
const { products } = require("../db/schema/products.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { internalNotes } = require("../db/schema/internal_notes.schema");
const { eq, and, sql } = require("drizzle-orm");
const { safeLogAudit } = require("./auditService");

/**
 * Create a new product and initialize inventory balance
 */
async function createProduct({ locationId, userId, data }) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        locationId,
        name: data.name,
        sku: data.sku || null,
        unit: data.unit || "unit",
        sellingPrice: data.sellingPrice,
        costPrice: data.costPrice ?? 0,
        maxDiscountPercent: data.maxDiscountPercent ?? 0,
        notes: data.notes || null,
        isActive: true,
      })
      .returning();

    const [bal] = await tx
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, locationId),
          eq(inventoryBalances.productId, created.id),
        ),
      );

    if (!bal) {
      await tx.insert(inventoryBalances).values({
        locationId,
        productId: created.id,
        qtyOnHand: 0,
        updatedAt: new Date(),
      });
    }

    // ✅ Audit (non-blocking) — safeLogAudit strips unsupported fields
    await safeLogAudit({
      userId,
      action: "PRODUCT_CREATE",
      entity: "product",
      entityId: created.id,
      description: `Created product: ${created.name}`,
      meta: { productId: created.id, name: created.name, locationId },
      locationId,
    });

    return created;
  });
}

/**
 * List products for a location
 * - includePurchasePrice = true for manager/admin/owner
 * - includeInactive = true to include archived products
 */
async function listProducts({
  locationId,
  includePurchasePrice,
  includeInactive = false,
}) {
  const where = includeInactive
    ? eq(products.locationId, locationId)
    : and(eq(products.locationId, locationId), eq(products.isActive, true));

  const rows = await db
    .select({
      id: products.id,
      locationId: products.locationId,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      sellingPrice: products.sellingPrice,
      costPrice: products.costPrice,
      maxDiscountPercent: products.maxDiscountPercent,
      isActive: products.isActive,
      notes: products.notes,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(where);

  if (includePurchasePrice) {
    return rows.map((p) => ({ ...p, purchasePrice: p.costPrice ?? 0 }));
  }

  return rows.map((p) => {
    const { costPrice, ...rest } = p;
    return { ...rest, purchasePrice: null };
  });
}

/**
 * Update pricing (manager/admin/owner)
 */
async function updateProductPricing({
  locationId,
  userId,
  productId,
  purchasePrice,
  sellingPrice,
  maxDiscountPercent,
}) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    const [updated] = await tx
      .update(products)
      .set({
        costPrice: purchasePrice,
        sellingPrice,
        maxDiscountPercent: maxDiscountPercent ?? 0,
      })
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      )
      .returning();

    await safeLogAudit({
      userId,
      action: "PRODUCT_PRICING_UPDATE",
      entity: "product",
      entityId: productId,
      description: `Updated pricing for product #${productId}`,
      meta: {
        productId,
        purchasePrice,
        sellingPrice,
        maxDiscountPercent: maxDiscountPercent ?? 0,
        locationId,
      },
      locationId,
    });

    return { ...updated, purchasePrice: updated.costPrice ?? 0 };
  });
}

/**
 * Get inventory balances joined with product info
 */
async function getInventoryBalances({ locationId, includeInactive = false }) {
  // Include archived products only if includeInactive=true
  const extraWhere = includeInactive ? sql`` : sql` AND p.is_active = true`;

  return db.execute(sql`
    SELECT p.id, p.name, p.sku, p.unit,
           p.selling_price as "sellingPrice",
           p.cost_price as "purchasePrice",
           p.max_discount_percent as "maxDiscountPercent",
           p.is_active as "isActive",
           b.qty_on_hand as "qtyOnHand",
           b.updated_at as "updatedAt"
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id AND b.location_id = p.location_id
    WHERE p.location_id = ${locationId}
    ${extraWhere}
    ORDER BY p.id DESC
  `);
}

/**
 * Adjust inventory safely (for arrivals or manual adjustments)
 */
async function adjustInventory(
  { locationId, userId, productId, qtyChange, reason },
  tx,
) {
  const qty = Number(qtyChange);
  if (!Number.isFinite(qty) || qty === 0) {
    const err = new Error("qtyChange must be a non-zero number");
    err.code = "BAD_QTY_CHANGE";
    throw err;
  }

  const run = async (trx) => {
    const prod = await trx
      .select({
        id: products.id,
        name: products.name,
        isActive: products.isActive,
      })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!prod[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (prod[0].isActive === false) {
      const err = new Error("Product is archived");
      err.code = "ARCHIVED";
      throw err;
    }

    const [balRow] = await trx
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, locationId),
          eq(inventoryBalances.productId, productId),
        ),
      );

    let newQty;

    if (balRow) {
      newQty = Number(balRow.qtyOnHand || 0) + qty;
      if (newQty < 0) {
        const err = new Error("Insufficient stock");
        err.code = "INSUFFICIENT_STOCK";
        throw err;
      }

      await trx
        .update(inventoryBalances)
        .set({ qtyOnHand: newQty, updatedAt: new Date() })
        .where(eq(inventoryBalances.id, balRow.id));
    } else {
      newQty = qty;
      if (newQty < 0) {
        const err = new Error("Insufficient stock");
        err.code = "INSUFFICIENT_STOCK";
        throw err;
      }

      await trx.insert(inventoryBalances).values({
        locationId,
        productId,
        qtyOnHand: newQty,
        updatedAt: new Date(),
      });
    }

    await safeLogAudit({
      userId: userId ?? null,
      action: "INVENTORY_ADJUST",
      entity: "product",
      entityId: productId,
      description: `Product ${prod[0].name}: qtyChange=${qty}. Reason: ${reason || "-"}`,
      meta: {
        productId,
        qtyChange: qty,
        reason: reason || null,
        locationId,
      },
      locationId,
    });

    return { productId, qtyOnHand: newQty };
  };

  if (tx) return run(tx);
  return db.transaction(async (trx) => run(trx));
}

/**
 * ✅ Archive product (soft delete)
 */
async function archiveProduct({ locationId, userId, productId, reason }) {
  const cleanReason =
    String(reason || "")
      .trim()
      .slice(0, 200) || null;

  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: products.id,
        name: products.name,
        isActive: products.isActive,
        notes: products.notes,
      })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (found[0].isActive === false) return found[0];

    const nextNotes = cleanReason
      ? `${String(found[0].notes || "").trim()}\n[ARCHIVED] ${cleanReason}`.trim()
      : found[0].notes;

    const [updated] = await tx
      .update(products)
      .set({
        isActive: false,
        notes: nextNotes,
      })
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      )
      .returning();

    await safeLogAudit({
      userId,
      action: "PRODUCT_ARCHIVE",
      entity: "product",
      entityId: productId,
      description: `Archived product: ${found[0].name}`,
      meta: { productId, reason: cleanReason, locationId },
      locationId,
    });

    return updated;
  });
}

/**
 * ✅ Restore archived product
 */
async function restoreProduct({ locationId, userId, productId }) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: products.id,
        name: products.name,
        isActive: products.isActive,
      })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (found[0].isActive === true) return found[0];

    const [updated] = await tx
      .update(products)
      .set({ isActive: true })
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      )
      .returning();

    await safeLogAudit({
      userId,
      action: "PRODUCT_RESTORE",
      entity: "product",
      entityId: productId,
      description: `Restored product: ${found[0].name}`,
      meta: { productId, locationId },
      locationId,
    });

    return updated;
  });
}

/**
 * ⚠️ Guarded hard delete
 * Only deletes if:
 * - qtyOnHand is 0 (or balance row missing)
 * - no internal notes for entityType=product
 *
 * NOTE:
 * I cannot confirm your sales/arrivals tables and foreign keys here,
 * so this is a "minimum safe" delete for your current codebase.
 */
async function deleteProductIfSafe({ locationId, userId, productId }) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!found[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    const [bal] = await tx
      .select({ qtyOnHand: inventoryBalances.qtyOnHand })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, locationId),
          eq(inventoryBalances.productId, productId),
        ),
      );

    const qty = Number(bal?.qtyOnHand ?? 0);
    if (qty !== 0) {
      const err = new Error("Cannot delete: stock is not zero");
      err.code = "STOCK_NOT_ZERO";
      throw err;
    }

    // Prevent deleting if there are notes attached
    const noteRows = await tx
      .select({ id: internalNotes.id })
      .from(internalNotes)
      .where(
        and(
          eq(internalNotes.locationId, locationId),
          eq(internalNotes.entityType, "product"),
          eq(internalNotes.entityId, productId),
        ),
      )
      .limit(1);

    if (noteRows.length > 0) {
      const err = new Error("Cannot delete: product has notes");
      err.code = "HAS_NOTES";
      throw err;
    }

    // delete balance first
    await tx
      .delete(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.locationId, locationId),
          eq(inventoryBalances.productId, productId),
        ),
      );

    await tx
      .delete(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    await safeLogAudit({
      userId,
      action: "PRODUCT_DELETE",
      entity: "product",
      entityId: productId,
      description: `Deleted product: ${found[0].name}`,
      meta: { productId, locationId },
      locationId,
    });

    return { ok: true };
  });
}

module.exports = {
  createProduct,
  listProducts,
  updateProductPricing,
  getInventoryBalances,
  adjustInventory,
  archiveProduct,
  restoreProduct,
  deleteProductIfSafe,
};
