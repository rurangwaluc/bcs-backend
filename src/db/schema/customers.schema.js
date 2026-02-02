const { pgTable, serial, integer, varchar, timestamp, text } = require("drizzle-orm/pg-core");

const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow()
});

module.exports = { customers };
