CREATE TABLE "streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_completed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "streaks_user_id_task_id_unique" UNIQUE("user_id","task_id")
);
--> statement-breakpoint
DROP TABLE "point_events" CASCADE;--> statement-breakpoint
DROP TABLE "user_stats" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "activity_type" text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "visibility" text DEFAULT 'only_me' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "joinability" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "max_participants" integer;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "leaderboard_opt_out";