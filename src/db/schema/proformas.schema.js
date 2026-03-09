"use strict";

const {
  pgTable,
  bigserial,
  integer,
  varchar,
  bigint,
  text,
  timestamp,
  date,
  index,
} = require("drizzle-orm/pg-core");

const proformas = pgTable(
  "proformas",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    locationId: integer("location_id").notNull(),
    customerId: integer("customer_id"),
    createdByUserId: integer("created_by_user_id").notNull(),

    proformaNo: varchar("proforma_no", { length: 120 }),
    status: varchar("status", { length: 30 }).notNull().default("DRAFT"),

    customerName: varchar("customer_name", { length: 160 }),
    customerPhone: varchar("customer_phone", { length: 40 }),
    customerTin: varchar("customer_tin", { length: 60 }),
    customerAddress: text("customer_address"),

    currency: varchar("currency", { length: 12 }).notNull().default("RWF"),
    subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
    totalAmount: bigint("total_amount", { mode: "number" })
      .notNull()
      .default(0),

    validUntil: date("valid_until"),
    note: text("note"),
    terms: text("terms"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationCreatedIdx: index("idx_proformas_location_created").on(
      t.locationId,
      t.createdAt,
    ),
  }),
);

module.exports = { proformas };
