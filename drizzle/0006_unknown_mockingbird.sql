ALTER TABLE "activities" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "priority" varchar(40);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "size" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "relationship_status" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_name" varchar(160);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "decision_maker" varchar(180);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "next_step" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "next_step_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "do_not_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;