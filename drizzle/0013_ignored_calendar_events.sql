ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'archived';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ignored_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"provider" varchar(80) DEFAULT 'google_calendar' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ignored_calendar_events" ADD CONSTRAINT "ignored_calendar_events_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
