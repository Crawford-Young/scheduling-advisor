ALTER TABLE "calendar_prefs" ADD COLUMN "default_visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_series" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;