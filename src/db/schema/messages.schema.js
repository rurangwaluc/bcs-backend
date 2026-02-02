const { pgTable, serial, integer, varchar, text, timestamp } = require("drizzle-orm/pg-core");

const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),

  entityType: varchar("entity_type", { length: 40 }).notNull(), 
  entityId: integer("entity_id").notNull(),

  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 40 }).notNull(),

  message: text("message").notNull(),
  isSystem: integer("is_system").default(0), // 0 = user, 1 = system

  createdAt: timestamp("created_at").defaultNow()
});

module.exports = { messages };
