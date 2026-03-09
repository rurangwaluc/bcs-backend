"use strict";

const {
  pgTable,
  bigserial,
  integer,
  varchar,
  text,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");

const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    saleId: integer("sale_id").notNull(),
    customerId: integer("customer_id"),
    createdByUserId: integer("created_by_user_id").notNull(),

    deliveryNoteNo: varchar("delivery_note_no", { length: 120 }),
    status: varchar("status", { length: 30 }).notNull().default("ISSUED"),

    customerName: varchar("customer_name", { length: 160 }),
    customerPhone: varchar("customer_phone", { length: 40 }),
    customerTin: varchar("customer_tin", { length: 60 }),
    customerAddress: text("customer_address"),

    deliveredTo: varchar("delivered_to", { length: 160 }),
    deliveredPhone: varchar("delivered_phone", { length: 40 }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),

    note: text("note"),

    totalItems: integer("total_items").notNull().default(0),
    totalQty: integer("total_qty").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationCreatedIdx: index("idx_delivery_notes_location_created").on(
      t.locationId,
      t.createdAt,
    ),
    saleIdx: index("idx_delivery_notes_sale_id").on(t.saleId),
  }),
);

module.exports = { deliveryNotes };
