const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id").notNull(),
    saleId: integer("sale_id").notNull(),
    cashierId: integer("cashier_id").notNull(),

    // normal checkout payments may be linked to an open cash session
    cashSessionId: integer("cash_session_id"),

    amount: integer("amount").notNull(),

    // CASH / MOMO / CARD / BANK / OTHER
    method: varchar("method", { length: 30 }).notNull().default("CASH"),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // one direct checkout payment row per sale
    uniqSale: uniqueIndex("payments_sale_unique").on(t.saleId),
  }),
);

module.exports = { payments };
