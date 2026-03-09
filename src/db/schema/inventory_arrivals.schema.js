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

const inventoryArrivals = pgTable(
  "inventory_arrivals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    supplierId: integer("supplier_id"),

    reference: varchar("reference", { length: 120 }),
    documentNo: varchar("document_no", { length: 120 }),

    sourceType: varchar("source_type", { length: 40 })
      .notNull()
      .default("MANUAL"),
    sourceId: integer("source_id"),

    notes: text("notes"),

    totalAmount: bigint("total_amount", { mode: "number" })
      .notNull()
      .default(0),

    receivedByUserId: integer("received_by_user_id").notNull(),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationReceivedAtIdx: index(
      "idx_inventory_arrivals_location_received_at",
    ).on(t.locationId, t.receivedAt),
    supplierIdx: index("idx_inventory_arrivals_supplier").on(t.supplierId),
    receivedByIdx: index("idx_inventory_arrivals_received_by").on(
      t.receivedByUserId,
    ),
  }),
);

module.exports = { inventoryArrivals };
