CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lng" double precision NOT NULL,
	"mode" text NOT NULL,
	"duration_min" integer NOT NULL,
	"distance_meters" integer NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "location_lng" double precision;--> statement-breakpoint
ALTER TABLE "calendar_prefs" ADD COLUMN "travel_mode" text DEFAULT 'driving' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_lng" double precision;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "places_user_name_unique" ON "places" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "travel_cache_pair_mode_unique" ON "travel_cache" USING btree ("origin_lat","origin_lng","dest_lat","dest_lng","mode");