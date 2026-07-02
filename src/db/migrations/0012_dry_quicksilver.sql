ALTER TABLE "calendar_prefs" ALTER COLUMN "working_hours_start" SET DEFAULT 540;--> statement-breakpoint
ALTER TABLE "calendar_prefs" ALTER COLUMN "working_hours_end" SET DEFAULT 1020;--> statement-breakpoint
ALTER TABLE "calendar_prefs" ADD COLUMN "ttl_days" integer;--> statement-breakpoint
UPDATE "calendar_prefs" SET "working_hours_start" = "working_hours_start" * 60, "working_hours_end" = "working_hours_end" * 60 WHERE "working_hours_end" <= 24;--> statement-breakpoint
UPDATE "calendar_prefs" SET "day_overrides" = (SELECT jsonb_object_agg(key, jsonb_build_object('wake', (value->>'wake')::int * 60, 'sleep', (value->>'sleep')::int * 60)) FROM jsonb_each("day_overrides")) WHERE "day_overrides" IS NOT NULL AND "day_overrides" != '{}'::jsonb;