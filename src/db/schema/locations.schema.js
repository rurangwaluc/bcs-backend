const { pgTable, serial, varchar } = require("drizzle-orm/pg-core");

const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
});

module.exports = { locations };
