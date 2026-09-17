CREATE TYPE "public"."connector_status" AS ENUM('draft', 'configured', 'active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('queued', 'running', 'completed', 'completed_with_warnings', 'failed');--> statement-breakpoint
CREATE TABLE "connector_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"status" "connector_status" DEFAULT 'draft' NOT NULL,
	"terms_url" text,
	"credential_reference" varchar(160),
	"refresh_minutes" integer,
	"last_success_at" timestamp,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connector_sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"received_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"triggered_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_duplicates" DROP CONSTRAINT "contact_duplicates_id_pk";--> statement-breakpoint
ALTER TABLE "connector_sources" ADD CONSTRAINT "connector_sources_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_id_connector_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."connector_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_triggered_by_id_user_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;