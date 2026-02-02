const {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} = require("drizzle-orm/pg-core");

const inventoryArrivalDocuments = pgTable("inventory_arrival_documents", {
  id: serial("id").primaryKey(),
  arrivalId: integer("inventory_arrival_id").notNull(), // JS name → DB column
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

module.exports = { inventoryArrivalDocuments };
