DROP TABLE "streaks" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_group_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_days" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_count" integer;--> statement-breakpoint
UPDATE "tasks" t SET "recurrence_group_id" = g.gid
FROM (
  SELECT "user_id", "title", "recurrence", gen_random_uuid() AS gid
  FROM "tasks" WHERE "recurrence" IS NOT NULL
  GROUP BY "user_id", "title", "recurrence"
) g
WHERE t."recurrence" IS NOT NULL
  AND t."user_id" = g."user_id" AND t."title" = g."title" AND t."recurrence" = g."recurrence";
--> statement-breakpoint
CREATE INDEX "tasks_user_group_idx" ON "tasks" ("user_id","recurrence_group_id") WHERE "recurrence_group_id" IS NOT NULL;