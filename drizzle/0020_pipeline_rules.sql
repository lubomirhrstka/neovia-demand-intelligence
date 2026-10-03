ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "next_step_due_at" timestamp;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "stage_changed_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "close_reason" text;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "pipeline" varchar(20) DEFAULT 'sales' NOT NULL;
-- doba ve fázi pro stávající případy odhadneme z poslední úpravy
UPDATE "opportunities" SET "stage_changed_at" = "updated_at" WHERE "stage_changed_at" > "updated_at";
