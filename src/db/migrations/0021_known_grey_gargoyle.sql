CREATE TABLE "event_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"color" text,
	"freq" text NOT NULL,
	"weekdays" jsonb,
	"day_of_month" integer,
	"nth_ordinal" integer,
	"nth_weekday" integer,
	"month" integer,
	"start_minutes" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"time_zone" text,
	"until" timestamp with time zone,
	"generated_through" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_event_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."event_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "event_series" ("user_id", "activity_id", "title", "description", "location", "color", "freq", "weekdays", "start_minutes", "duration_min", "time_zone", "generated_through")
SELECT a."user_id", a."id", a."title", a."description", a."default_location", a."color", 'weekly',
       s."days", s."start_minutes", s."duration_min", a."time_zone", a."generated_through"
FROM "activities" a
CROSS JOIN LATERAL (
  SELECT jsonb_agg(DISTINCT (slot->>'day')::int) AS "days",
         (slot->>'startMinutes')::int AS "start_minutes",
         (slot->>'durationMin')::int AS "duration_min"
  FROM jsonb_array_elements(a."schedule") AS slot
  GROUP BY (slot->>'startMinutes')::int, (slot->>'durationMin')::int
) s
WHERE jsonb_array_length(a."schedule") > 0;