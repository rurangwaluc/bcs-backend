const {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
} = require("drizzle-orm/pg-core");

const { locations } = require("./locations.schema");

const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    name: varchar("name", { length: 120 }).notNull(),

    // email is no longer globally unique
    email: varchar("email", { length: 150 }).notNull(),

    passwordHash: varchar("password_hash", { length: 255 }).notNull(),

    role: varchar("role", { length: 50 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => ({
    usersLocationEmailUniq: uniqueIndex("users_location_email_uniq").on(
      t.locationId,
      t.email,
    ),

    usersLocationIdx: index("users_location_idx").on(t.locationId),
    usersRoleIdx: index("users_role_idx").on(t.role),
    usersActiveIdx: index("users_is_active_idx").on(t.isActive),
  }),
);

module.exports = { users };
