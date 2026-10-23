ALTER TABLE "project" ADD COLUMN "repository" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "repository_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspaceId_repositoryKey_unique" ON "project" ("workspace_id","repository_key");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_repository_check" CHECK (("repository" is null) = ("repository_key" is null));