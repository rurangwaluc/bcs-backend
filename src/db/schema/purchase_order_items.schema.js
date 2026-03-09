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

const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    purchaseOrderId: bigint("purchase_order_id", { mode: "number" }).notNull(),
    productId: integer("product_id"),

    productName: varchar("product_name", { length: 180 }).notNull(),
    productDisplayName: varchar("product_display_name", { length: 220 }),
    productSku: varchar("product_sku", { length: 80 }),

    stockUnit: varchar("stock_unit", { length: 40 }).notNull().default("PIECE"),
    purchaseUnit: varchar("purchase_unit", { length: 40 })
      .notNull()
      .default("PIECE"),
    purchaseUnitFactor: integer("purchase_unit_factor").notNull().default(1),

    qtyOrdered: integer("qty_ordered").notNull().default(0),
    qtyReceived: integer("qty_received").notNull().default(0),

    unitCost: bigint("unit_cost", { mode: "number" }).notNull().default(0),
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),

    note: varchar("note", { length: 300 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    poIdx: index("idx_purchase_order_items_po_id").on(t.purchaseOrderId),
    productIdx: index("idx_purchase_order_items_product_id").on(t.productId),
  }),
);

module.exports = { purchaseOrderItems };
