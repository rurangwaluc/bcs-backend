const {
  pgTable,
  serial,
  varchar,
  uniqueIndex,
} = require("drizzle-orm/pg-core");

const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
  },
  (t) => ({
    codeUniq: uniqueIndex("locations_code_uniq").on(t.code),
  }),
);

module.exports = { locations };
