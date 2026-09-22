CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) DEFAULT 'gmail' NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(180),
	"access_token" text,
	"refresh_token" text,
	"scope" text,
	"token_type" varchar(40),
	"expires_at" timestamp,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
