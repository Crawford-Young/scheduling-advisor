ALTER TABLE "tasks" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;