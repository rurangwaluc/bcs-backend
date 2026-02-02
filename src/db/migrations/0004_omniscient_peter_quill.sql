CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(40) NOT NULL,
	"message" text NOT NULL,
	"is_system" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
