const { z } = require("zod");

/**
 * Option B (NO holdings):
 * - Seller creates sale as DRAFT
 * - Storekeeper fulfills sale -> deduct inventory -> status becomes FULFILLED
 * - Seller marks PAID/PENDING (finalize) -> status changes
 *
 * Discounts:
 * - Seller CANNOT increase unit price above product sellingPrice
 * - Seller discountPercent cannot exceed product.maxDiscountPercent
 * - Sale-level discountPercent must obey strictest maxDiscountPercent among items
 */

const createSaleSchema = z.object({
  customerId: z.number().int().positive().optional(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  note: z.string().nullable().optional(),

  discountPercent: z.coerce.number().min(0).max(100).optional(),
  discountAmount: z.coerce.number().int().min(0).optional(),

  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().positive(),
        unitPrice: z.coerce.number().int().min(0).optional(),
        discountPercent: z.coerce.number().min(0).max(100).optional(),
        discountAmount: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

/**
 * Seller finalizes AFTER fulfill
 * (we keep body same as before)
 */
const markSaleSchema = z.object({
  status: z.enum(["PAID", "PENDING"]),
  paymentMethod: z.enum(["CASH", "MOMO", "BANK"]).optional(),
});

const cancelSaleSchema = z.object({
  reason: z.string().min(3),
});

/**
 * Storekeeper fulfills a DRAFT sale (deduct inventory)
 * Body kept simple (optional note)
 */
const fulfillSaleSchema = z.object({
  note: z.string().max(200).nullable().optional(),
});

module.exports = {
  createSaleSchema,
  markSaleSchema,
  cancelSaleSchema,
  fulfillSaleSchema,
};
