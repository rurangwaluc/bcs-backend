const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  uniqueIndex,
  index,
} = require("drizzle-orm/pg-core");

const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    saleId: integer("sale_id").notNull(),
    cashierId: integer("cashier_id").notNull(),

    // ✅ REQUIRED: links payment to the OPEN session that recorded it
    cashSessionId: integer("cash_session_id").notNull(),

    amount: integer("amount").notNull(),
    method: varchar("method", { length: 30 }).default("CASH"),
    note: text("note"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    uniqSale: uniqueIndex("payments_sale_unique").on(t.saleId),
    idxSession: index("payments_cash_session_idx").on(t.cashSessionId),
  }),
);

module.exports = { payments };
