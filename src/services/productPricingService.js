// backend/src/services/productPricingService.js
const { db } = require("../config/db");
const { products } = require("../db/schema/products.schema");
const { auditLogs } = require("../db/schema/audit_logs.schema");
const { eq, and } = require("drizzle-orm");

async function updatePricing({
  locationId,
  productId,
  purchasePrice,
  sellingPrice,
  maxDiscountPercent,
  userId,
}) {
  // safety
  const pp = Number(purchasePrice);
  const sp = Number(sellingPrice);
  const md = Number(maxDiscountPercent);

  if (!Number.isFinite(pp) || pp < 0) {
    const err = new Error("Purchase price must be >= 0");
    err.code = "BAD_PRICE";
    throw err;
  }

  if (!Number.isFinite(sp) || sp <= 0) {
    const err = new Error("Selling price must be > 0");
    err.code = "BAD_PRICE";
    throw err;
  }

  if (!Number.isFinite(md) || md < 0 || md > 100) {
    const err = new Error("maxDiscountPercent must be between 0 and 100");
    err.code = "BAD_PRICE";
    throw err;
  }

  if (sp < pp) {
    const err = new Error("Selling price cannot be below purchase price");
    err.code = "BAD_PRICE";
    throw err;
  }

  // ✅ IMPORTANT:
  // purchasePrice from payload must be saved in products.costPrice (DB: cost_price)
  const [product] = await db
    .update(products)
    .set({
      costPrice: pp,
      sellingPrice: sp,
      maxDiscountPercent: md,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.locationId, locationId)))
    .returning();

  if (!product) {
    const err = new Error("Product not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  await db.insert(auditLogs).values({
    userId,
    action: "PRODUCT_PRICING_UPDATE",
    entity: "product",
    entityId: productId,
    description: `Pricing updated: purchase=${pp}, selling=${sp}, maxDiscount=${md}%`,
  });

  return product;
}

module.exports = { updatePricing };
