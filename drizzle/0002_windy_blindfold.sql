CREATE TABLE "capacities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"role" varchar(180) NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"location" varchar(180),
	"availability" varchar(120),
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacities" ADD CONSTRAINT "capacities_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;