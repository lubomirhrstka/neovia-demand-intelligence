ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_provider" varchar(80);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "synced_at" timestamp;
