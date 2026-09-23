ALTER TABLE "monitor_settings" ADD COLUMN IF NOT EXISTS "blacklisted_companies" jsonb DEFAULT '[]'::jsonb NOT NULL;
