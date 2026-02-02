CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
