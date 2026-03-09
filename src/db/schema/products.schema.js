const {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  boolean,
  bigint,
  text,
  index,
} = require("drizzle-orm/pg-core");

const { locations } = require("./locations.schema");

const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),

    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),

    // Existing core fields
    name: varchar("name", { length: 160 }).notNull(),
    sku: varchar("sku", { length: 80 }),
    unit: varchar("unit", { length: 30 }).notNull().default("PIECE"),

    sellingPrice: bigint("selling_price", { mode: "number" })
      .notNull()
      .default(0),

    costPrice: bigint("cost_price", { mode: "number" }).notNull().default(0),

    maxDiscountPercent: integer("max_discount_percent").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),

    notes: text("notes"),

    // New professional catalog fields
    productType: varchar("product_type", { length: 40 })
      .notNull()
      .default("HARDWARE"), // HARDWARE | APPAREL | FOOTWEAR | PPE | ACCESSORY | OTHER

    category: varchar("category", { length: 80 }).default("GENERAL"),
    subcategory: varchar("subcategory", { length: 80 }),

    brand: varchar("brand", { length: 80 }),
    model: varchar("model", { length: 120 }),

    variantLabel: varchar("variant_label", { length: 120 }), // e.g. "Size 42 Black"
    size: varchar("size", { length: 40 }),
    color: varchar("color", { length: 40 }),
    material: varchar("material", { length: 80 }),

    barcode: varchar("barcode", { length: 120 }),
    supplierCode: varchar("supplier_code", { length: 120 }),

    reorderLevel: integer("reorder_level").notNull().default(0),

    // For mixed quincaillerie catalog
    gender: varchar("gender", { length: 20 }), // MEN | WOMEN | UNISEX | KIDS
    season: varchar("season", { length: 40 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    productsLocationIdx: index("products_location_idx").on(table.locationId),
    productsLocationNameIdx: index("products_location_name_idx").on(
      table.locationId,
      table.name,
    ),
    productsLocationSkuIdx: index("products_location_sku_idx").on(
      table.locationId,
      table.sku,
    ),
    productsLocationBarcodeIdx: index("products_location_barcode_idx").on(
      table.locationId,
      table.barcode,
    ),
    productsLocationTypeIdx: index("products_location_type_idx").on(
      table.locationId,
      table.productType,
    ),
    productsLocationCategoryIdx: index("products_location_category_idx").on(
      table.locationId,
      table.category,
    ),
    productsLocationActiveIdx: index("products_location_active_idx").on(
      table.locationId,
      table.isActive,
    ),
  }),
);

module.exports = { products };
