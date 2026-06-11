CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_expires_at_idx" ON "conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "conversations_deleted_at_idx" ON "conversations" USING btree ("deleted_at");