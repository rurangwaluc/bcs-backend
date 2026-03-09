"use strict";

const {
  pgTable,
  bigserial,
  bigint,
  integer,
  varchar,
  timestamp,
} = require("drizzle-orm/pg-core");

const inventoryArrivalItems = pgTable("inventory_arrival_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),

  arrivalId: bigint("arrival_id", { mode: "number" }).notNull(),
  productId: integer("product_id").notNull(),

  productName: varchar("product_name", { length: 180 }).notNull(),
  productDisplayName: varchar("product_display_name", { length: 220 }),
  productSku: varchar("product_sku", { length: 80 }),

  stockUnit: varchar("stock_unit", { length: 40 }).notNull().default("PIECE"),
  purchaseUnit: varchar("purchase_unit", { length: 40 })
    .notNull()
    .default("PIECE"),
  purchaseUnitFactor: integer("purchase_unit_factor").notNull().default(1),

  qtyReceived: integer("qty_received").notNull().default(0),
  bonusQty: integer("bonus_qty").notNull().default(0),
  stockQtyReceived: integer("stock_qty_received").notNull().default(0),

  unitCost: bigint("unit_cost", { mode: "number" }).notNull().default(0),
  lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),

  note: varchar("note", { length: 300 }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

module.exports = { inventoryArrivalItems };
