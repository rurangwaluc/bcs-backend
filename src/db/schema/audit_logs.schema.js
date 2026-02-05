// backend/src/db/schema/audit_logs.schema.js
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

  // ✅ REQUIRED by DB (your error proves it's NOT NULL)
  locationId: integer("location_id").notNull(),

  userId: integer("user_id").notNull(),

  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),

  description: text("description").notNull(),

  meta: jsonb("meta"), // optional
  createdAt: timestamp("created_at").defaultNow(),
});

module.exports = { auditLogs };
