const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
} = require("drizzle-orm/pg-core");

const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),

  // ✅ DB requires NOT NULL
  locationId: integer("location_id").notNull(),

  userId: integer("user_id"),

  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: integer("entity_id"),

  description: text("description"),
  meta: text("meta"),

  createdAt: timestamp("created_at").defaultNow(),
});

module.exports = { auditLogs };
