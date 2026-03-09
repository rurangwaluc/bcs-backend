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

const deliveryNoteItems = pgTable(
  "delivery_note_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    deliveryNoteId: bigint("delivery_note_id", { mode: "number" }).notNull(),
    saleItemId: integer("sale_item_id"),
    productId: integer("product_id"),

    productName: varchar("product_name", { length: 180 }).notNull(),
    productDisplayName: varchar("product_display_name", { length: 220 }),
    productSku: varchar("product_sku", { length: 80 }),

    stockUnit: varchar("stock_unit", { length: 40 }).notNull().default("PIECE"),
    qty: integer("qty").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    deliveryNoteIdx: index("idx_delivery_note_items_delivery_note_id").on(
      t.deliveryNoteId,
    ),
  }),
);

module.exports = { deliveryNoteItems };
