const {
  pgTable,
  serial,
  varchar,
  uniqueIndex,
  index,
  timestamp,
  pgEnum,
} = require("drizzle-orm/pg-core");

const locationStatusEnum = pgEnum("location_status", [
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
]);

const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),

    status: locationStatusEnum("status").notNull().default("ACTIVE"),

    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    closeReason: varchar("close_reason", { length: 500 }),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    codeUniq: uniqueIndex("locations_code_uniq").on(t.code),
    locationsStatusIdx: index("locations_status_idx").on(t.status),
  }),
);

module.exports = { locations, locationStatusEnum };
