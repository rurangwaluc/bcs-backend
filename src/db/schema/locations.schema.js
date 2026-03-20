const {
  pgTable,
  serial,
  varchar,
  uniqueIndex,
  index,
  timestamp,
  pgEnum,
  jsonb,
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

    // branch branding + business document info
    email: varchar("email", { length: 160 }),
    phone: varchar("phone", { length: 40 }),
    website: varchar("website", { length: 200 }),
    logoUrl: varchar("logo_url", { length: 500 }),

    address: varchar("address", { length: 255 }),
    tin: varchar("tin", { length: 64 }),
    momoCode: varchar("momo_code", { length: 64 }),
    bankAccounts: jsonb("bank_accounts").$type().notNull().default([]),

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
