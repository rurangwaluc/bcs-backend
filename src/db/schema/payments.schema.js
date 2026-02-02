const { pgTable, serial, integer, varchar, timestamp, text, uniqueIndex } = require("drizzle-orm/pg-core");

const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),

    saleId: integer("sale_id").notNull(),
    cashierId: integer("cashier_id").notNull(),

    amount: integer("amount").notNull(),
    method: varchar("method", { length: 30 }).default("CASH"),
    note: text("note"),

    createdAt: timestamp("created_at").defaultNow()
  },
  (t) => ({
    uniqSale: uniqueIndex("payments_sale_unique").on(t.saleId)
  })
);

module.exports = { payments };
