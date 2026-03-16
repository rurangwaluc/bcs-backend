const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
} = require("drizzle-orm/pg-core");

const cashLedger = pgTable("cash_ledger", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),
  cashierId: integer("cashier_id").notNull(),

  // optional link to open cashier session
  cashSessionId: integer("cash_session_id"),

  // SALE_PAYMENT, CREDIT_PAYMENT, PETTY_CASH_IN, PETTY_CASH_OUT, VERSEMENT, OPENING_BALANCE, REFUND, etc
  type: varchar("type", { length: 40 }).notNull(),

  // IN / OUT
  direction: varchar("direction", { length: 10 }).notNull(),

  amount: integer("amount").notNull(),

  // CASH / MOMO / CARD / BANK / OTHER
  method: varchar("method", { length: 20 }).notNull().default("CASH"),

  // optional external reference (MoMo TXN ID, bank ref, etc)
  reference: varchar("reference", { length: 120 }),

  saleId: integer("sale_id"),
  paymentId: integer("payment_id"),

  // ✅ new for credit collection traceability
  creditId: integer("credit_id"),
  creditPaymentId: integer("credit_payment_id"),

  note: text("note"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

module.exports = { cashLedger };
