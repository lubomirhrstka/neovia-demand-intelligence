ALTER TABLE "demands" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN IF NOT EXISTS "deleted_by_id" text;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN IF NOT EXISTS "delete_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demands" ADD CONSTRAINT "demands_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
