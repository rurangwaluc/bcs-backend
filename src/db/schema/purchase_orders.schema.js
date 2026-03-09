"use strict";

const {
  pgTable,
  bigserial,
  integer,
  varchar,
  text,
  timestamp,
  bigint,
  index,
} = require("drizzle-orm/pg-core");

const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    supplierId: integer("supplier_id").notNull(),

    poNo: varchar("po_no", { length: 120 }),
    reference: varchar("reference", { length: 120 }),
    currency: varchar("currency", { length: 12 }).notNull().default("RWF"),

    status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
    notes: text("notes"),

    orderedAt: timestamp("ordered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    createdByUserId: integer("created_by_user_id").notNull(),
    approvedByUserId: integer("approved_by_user_id"),

    subtotalAmount: bigint("subtotal_amount", { mode: "number" })
      .notNull()
      .default(0),
    totalAmount: bigint("total_amount", { mode: "number" })
      .notNull()
      .default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationCreatedIdx: index("idx_purchase_orders_location_created").on(
      t.locationId,
      t.createdAt,
    ),
    supplierIdx: index("idx_purchase_orders_supplier").on(t.supplierId),
    statusIdx: index("idx_purchase_orders_status").on(t.status),
  }),
);

module.exports = { purchaseOrders };
