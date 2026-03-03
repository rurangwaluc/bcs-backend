// backend/src/db/schema/refunds.schema.js

const { pgTable, bigserial, integer, bigint, text, timestamp, varchar } = require("drizzle-orm/pg-core");

const refunds = pgTable("refunds", {
  id: bigserial("id", { mode: "number" }).primaryKey(),

  locationId: integer("location_id").notNull(),
  saleId: integer("sale_id").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),

  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),

  method: varchar("method", { length: 20 }).notNull().default("CASH"),
  reference: varchar("reference", { length: 120 }),
  paymentId: integer("payment_id"),
  cashSessionId: integer("cash_session_id"),

  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

module.exports = { refunds };