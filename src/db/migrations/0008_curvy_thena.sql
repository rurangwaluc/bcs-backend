CREATE TABLE "cash_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"cashier_id" integer NOT NULL,
	"type" varchar(40) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" integer NOT NULL,
	"method" varchar(20) DEFAULT 'CASH',
	"sale_id" integer,
	"payment_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
