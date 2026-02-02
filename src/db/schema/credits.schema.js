const { pgTable, serial, integer, varchar, timestamp, text } = require("drizzle-orm/pg-core");

const credits = pgTable("credits", {
  id: serial("id").primaryKey(),

  locationId: integer("location_id").notNull(),
  saleId: integer("sale_id").notNull(),
  customerId: integer("customer_id").notNull(),

  amount: integer("amount").notNull(),

  status: varchar("status", { length: 20 }).notNull().default("OPEN"), // OPEN, SETTLED

  createdBy: integer("created_by").notNull(),       // seller
  approvedBy: integer("approved_by"),               // manager/admin
  approvedAt: timestamp("approved_at"),

  settledBy: integer("settled_by"),
  settledAt: timestamp("settled_at"),

  note: text("note"),
  createdAt: timestamp("created_at").defaultNow()
});

module.exports = { credits };
