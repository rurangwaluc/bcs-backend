CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"customer_id" integer,
	"status" varchar(40) DEFAULT 'DRAFT' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"canceled_at" timestamp,
	"canceled_by" integer,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"sale_id" integer NOT NULL,
	"cashier_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" varchar(30) DEFAULT 'CASH',
	"note" text,
	"created_at" timestamp DEFAULT now()
);
