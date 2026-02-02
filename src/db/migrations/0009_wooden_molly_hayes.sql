CREATE TABLE "credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"sale_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"settled_by" integer,
	"settled_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
