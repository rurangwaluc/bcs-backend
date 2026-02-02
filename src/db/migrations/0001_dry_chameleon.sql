CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"sku" varchar(80),
	"unit" varchar(40) DEFAULT 'unit',
	"selling_price" integer NOT NULL,
	"cost_price" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_location_product_uniq" ON "inventory_balances" USING btree ("location_id","product_id");