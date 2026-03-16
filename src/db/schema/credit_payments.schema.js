// backend/src/db/schema/credit_payments.schema.js
"use strict";

const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
} = require("drizzle-orm/pg-core");

const creditPayments = pgTable("credit_payments", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),
  creditId: integer("credit_id").notNull(),
  saleId: integer("sale_id").notNull(),

  amount: integer("amount").notNull(),
  method: varchar("method", { length: 20 }).notNull(), // CASH / MOMO / CARD / BANK / OTHER

  cashSessionId: integer("cash_session_id"),
  receivedBy: integer("received_by").notNull(),

  reference: varchar("reference", { length: 120 }),
  note: text("note"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

module.exports = { creditPayments };
