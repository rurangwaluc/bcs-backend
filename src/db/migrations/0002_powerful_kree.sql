CREATE TABLE "stock_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"decided_at" timestamp,
	"decided_by" integer
);
--> statement-breakpoint
CREATE TABLE "stock_request_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_requested" integer NOT NULL,
	"qty_approved" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "seller_holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "seller_holdings_location_seller_product_uniq" ON "seller_holdings" USING btree ("location_id","seller_id","product_id");