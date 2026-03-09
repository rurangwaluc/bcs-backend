"use strict";

const {
  pgTable,
  bigserial,
  bigint,
  integer,
  varchar,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");

const goodsReceiptItems = pgTable(
  "goods_receipt_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    goodsReceiptId: bigint("goods_receipt_id", { mode: "number" }).notNull(),
    purchaseOrderItemId: bigint("purchase_order_item_id", {
      mode: "number",
    }).notNull(),

    productId: integer("product_id").notNull(),

    productName: varchar("product_name", { length: 180 }).notNull(),
    productDisplayName: varchar("product_display_name", { length: 220 }),
    productSku: varchar("product_sku", { length: 80 }),

    stockUnit: varchar("stock_unit", { length: 40 }).notNull().default("PIECE"),
    purchaseUnit: varchar("purchase_unit", { length: 40 })
      .notNull()
      .default("PIECE"),
    purchaseUnitFactor: integer("purchase_unit_factor").notNull().default(1),

    qtyReceivedPurchase: integer("qty_received_purchase").notNull().default(0),
    qtyReceivedStock: integer("qty_received_stock").notNull().default(0),

    unitCost: bigint("unit_cost", { mode: "number" }).notNull().default(0),
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),

    note: varchar("note", { length: 300 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    receiptIdx: index("idx_goods_receipt_items_receipt_id").on(
      t.goodsReceiptId,
    ),
    poItemIdx: index("idx_goods_receipt_items_po_item_id").on(
      t.purchaseOrderItemId,
    ),
  }),
);

module.exports = { goodsReceiptItems };
