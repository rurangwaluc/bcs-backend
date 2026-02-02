const { pgTable, serial, integer, varchar, timestamp, text } = require("drizzle-orm/pg-core");

const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  sellerId: integer("seller_id").notNull(),
  customerId: integer("customer_id"), // optional for now
  
  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 40 }),


  status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
  totalAmount: integer("total_amount").notNull().default(0),

  note: text("note"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  canceledAt: timestamp("canceled_at"),
  canceledBy: integer("canceled_by"),
  cancelReason: text("cancel_reason")
});

module.exports = { sales };
