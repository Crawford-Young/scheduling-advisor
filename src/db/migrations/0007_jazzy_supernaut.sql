ALTER TABLE "conversations" ADD COLUMN "type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "expires_at" timestamp DEFAULT now() + interval '30 days' NOT NULL;