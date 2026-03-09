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

const proformaItems = pgTable(
  "proforma_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    proformaId: bigint("proforma_id", { mode: "number" }).notNull(),
    productId: integer("product_id"),

    productName: varchar("product_name", { length: 180 }).notNull(),
    productDisplayName: varchar("product_display_name", { length: 220 }),
    productSku: varchar("product_sku", { length: 80 }),

    stockUnit: varchar("stock_unit", { length: 40 }).notNull().default("PIECE"),
    qty: integer("qty").notNull().default(0),
    unitPrice: bigint("unit_price", { mode: "number" }).notNull().default(0),
    lineTotal: bigint("line_total", { mode: "number" }).notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    proformaIdx: index("idx_proforma_items_proforma_id").on(t.proformaId),
  }),
);

module.exports = { proformaItems };
