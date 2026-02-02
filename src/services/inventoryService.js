// backend/src/services/inventoryService.js
const { db } = require("../config/db");
const { products } = require("../db/schema/products.schema");
const { inventoryBalances } = require("../db/schema/inventory.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and, sql } = require("drizzle-orm");

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

    // ✅ FIX: audit log must include locationId (DB requires NOT NULL)
    await tx.insert(auditLogs).values({
      locationId,
      userId,
      action: "PRODUCT_CREATE",
      entity: "product",
      entityId: created.id,
      description: `Created product: ${created.name}`,
    });

    return created;
  });
}

/**
 * List products for a location
 * - everyone gets sellingPrice
 * - only manager/admin/owner should see purchasePrice (costPrice)
 */
async function listProducts({ locationId, includePurchasePrice }) {
  const rows = await db
    .select({
      id: products.id,
      locationId: products.locationId,
      name: products.name,
      sku: products.sku,
      unit: products.unit,

      sellingPrice: products.sellingPrice,

      // purchase price (only if allowed)
      costPrice: products.costPrice,

      maxDiscountPercent: products.maxDiscountPercent,
      isActive: products.isActive,
      notes: products.notes,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.locationId, locationId));

  if (includePurchasePrice) {
    return rows.map((p) => ({
      ...p,
      purchasePrice: p.costPrice ?? 0,
    }));
  }

  // hide purchasePrice from roles that shouldn’t see it
  return rows.map((p) => {
    const { costPrice, ...rest } = p;
    return {
      ...rest,
      purchasePrice: null,
    };
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

    // ✅ FIX: audit log must include locationId
    await tx.insert(auditLogs).values({
      locationId,
      userId,
      action: "PRODUCT_PRICING_UPDATE",
      entity: "product",
      entityId: productId,
      description: `Updated pricing for product #${productId} (purchase=${purchasePrice}, selling=${sellingPrice}, maxDiscount=${maxDiscountPercent ?? 0}%)`,
    });

    return {
      ...updated,
      purchasePrice: updated.costPrice ?? 0,
    };
  });
}

/**
 * Get inventory balances joined with product info
 */
async function getInventoryBalances({ locationId }) {
  return db.execute(sql`
    SELECT p.id, p.name, p.sku, p.unit,
           p.selling_price as "sellingPrice",
           p.cost_price as "purchasePrice",
           p.max_discount_percent as "maxDiscountPercent",
           b.qty_on_hand as "qtyOnHand",
           b.updated_at as "updatedAt"
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id AND b.location_id = p.location_id
    WHERE p.location_id = ${locationId}
    ORDER BY p.id DESC
  `);
}

/**
 * Adjust inventory safely (for arrivals or manual adjustments)
 *
 * ✅ FIXES:
 * - supports optional tx passed by caller (so arrivals can stay in one transaction)
 * - enforces NOT NULL audit_logs.location_id by always writing locationId
 * - logs proper entityId as productId (not balance id which may be null)
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

  const exec = tx || db;

  // If no tx is provided, create a transaction; otherwise reuse caller tx.
  const run = async (trx) => {
    const prod = await trx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.locationId, locationId)),
      );

    if (!prod[0]) {
      const err = new Error("Product not found");
      err.code = "NOT_FOUND";
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

    // ✅ FIX: audit must include locationId (DB constraint)
    await trx.insert(auditLogs).values({
      locationId,
      userId: userId ?? null,
      action: "INVENTORY_ADJUST",
      entity: "inventory_balance",
      entityId: productId, // ✅ stable and non-null
      description: `Product ${prod[0].name}: qtyChange=${qty}. Reason: ${reason || "-"}`,
    });

    return { productId, qtyOnHand: newQty };
  };

  // If caller provided a tx, use it; otherwise create a new transaction.
  if (tx) return run(exec);
  return db.transaction(async (trx) => run(trx));
}

module.exports = {
  createProduct,
  listProducts,
  updateProductPricing,
  getInventoryBalances,
  adjustInventory,
};
