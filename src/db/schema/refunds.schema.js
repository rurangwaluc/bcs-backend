const { pgTable, serial, integer, text, timestamp } = require("drizzle-orm/pg-core");

const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),
  saleId: integer("sale_id").notNull(),

  amount: integer("amount").notNull(),
  reason: text("reason"),

  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

module.exports = { refunds };
