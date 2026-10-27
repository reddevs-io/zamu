CREATE INDEX "activity_actorId_createdAt_idx" ON "activity" ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_authorId_createdAt_idx" ON "comment" ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "milestone_projectId_status_targetDate_idx" ON "milestone" ("project_id","status","target_date");