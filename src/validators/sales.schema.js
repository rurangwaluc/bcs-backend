const { z } = require("zod");

/**
 * Phase 1 + Discount (combined):
 * - You can discount per item and/or at sale level.
 * - Seller CANNOT increase price above product sellingPrice in Phase 1.
 *
 * Supported inputs:
 * items[].unitPrice        -> negotiated unit price (<= sellingPrice)
 * items[].discountPercent  -> % discount applied on (unitPrice * qty)
 * items[].discountAmount   -> flat amount discount applied on the line
 *
 * sale-level:
 * discountPercent / discountAmount -> applied AFTER summing discounted lines
 */
const createSaleSchema = z.object({
  customerId: z.number().int().positive().optional(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  note: z.string().nullable().optional(),

  // Sale-level discount (optional)
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  discountAmount: z.coerce.number().int().min(0).optional(),

  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().positive(),

        // Optional per-item price/discounts
        unitPrice: z.coerce.number().int().min(0).optional(),
        discountPercent: z.coerce.number().min(0).max(100).optional(),
        discountAmount: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

// Seller marks sale as PAID or PENDING (cashier later records payment -> COMPLETED)
const markSaleSchema = z.object({
  status: z.enum(["PAID", "PENDING"]),
});

const cancelSaleSchema = z.object({
  reason: z.string().min(3),
});

module.exports = { createSaleSchema, markSaleSchema, cancelSaleSchema };
