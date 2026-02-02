const { pgTable, serial, integer, varchar, timestamp, text } = require("drizzle-orm/pg-core");

const stockRequests = pgTable("stock_requests", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  sellerId: integer("seller_id").notNull(),

  status: varchar("status", { length: 30 }).notNull().default("PENDING"), // PENDING, APPROVED, REJECTED, RELEASED, CANCELED
  note: text("note"),

  createdAt: timestamp("created_at").defaultNow(),
  decidedAt: timestamp("decided_at"),
  decidedBy: integer("decided_by")
});

module.exports = { stockRequests };
