CREATE TABLE "monitor_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minimum_salary" integer DEFAULT 80000 NOT NULL,
	"schedules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exports" jsonb DEFAULT '["CSV","JSON"]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitor_settings" ADD CONSTRAINT "monitor_settings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;