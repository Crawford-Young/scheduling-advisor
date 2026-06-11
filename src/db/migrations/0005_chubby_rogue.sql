-- Token payment pivot: replace user API key columns with credit model

-- 1. Remove API key columns from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "anthropic_api_key";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "google_ai_api_key";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "active_provider";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "preferred_model";--> statement-breakpoint

-- 2. Make plan nullable (drop not-null + default 'free', update enum)
ALTER TABLE "users" ALTER COLUMN "plan" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" DROP NOT NULL;--> statement-breakpoint

-- 3. Add tokenResetAt to users
ALTER TABLE "users" ADD COLUMN "token_reset_at" timestamp;--> statement-breakpoint

-- 4. Add skippedAt to check_ins
ALTER TABLE "check_ins" ADD COLUMN "skipped_at" timestamp;--> statement-breakpoint

-- 5. Add unique constraint on check_ins(user_id, task_id, scheduled_at)
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_task_id_scheduled_at_unique" UNIQUE("user_id","task_id","scheduled_at");--> statement-breakpoint

-- 6. Create token_ledger table
CREATE TABLE "token_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
