ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "secondary_email" varchar(255);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "secondary_phone" varchar(50);
