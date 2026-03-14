const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  jsonb,
} = require("drizzle-orm/pg-core");

const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id"),
  userId: integer("user_id"),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  description: text("description").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
});

module.exports = { auditLogs };
