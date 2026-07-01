ALTER TABLE "calendar_prefs" ADD COLUMN "day_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_prefs" ADD COLUMN "use_24h" boolean DEFAULT false NOT NULL;