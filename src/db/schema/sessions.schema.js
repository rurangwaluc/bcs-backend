const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp
} = require("drizzle-orm/pg-core");

const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),

  sessionToken: varchar("session_token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  createdAt: timestamp("created_at").defaultNow()
});

module.exports = { sessions };
