CREATE TABLE "series_slot_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recurrence_group_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	CONSTRAINT "series_slot_tombstones_recurrence_group_id_slot_start_unique" UNIQUE("recurrence_group_id","slot_start")
);
--> statement-breakpoint
ALTER TABLE "series_slot_tombstones" ADD CONSTRAINT "series_slot_tombstones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;