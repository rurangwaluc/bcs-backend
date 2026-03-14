const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
} = require("drizzle-orm/pg-core");

const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),

  sessionToken: varchar("session_token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  // Coverage mode (session-level, not user-level)
  actingAsRole: varchar("acting_as_role", { length: 50 }),
  coverageReason: varchar("coverage_reason", { length: 50 }),
  coverageNote: text("coverage_note"),
  coverageStartedAt: timestamp("coverage_started_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

module.exports = { sessions };
