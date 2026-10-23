CREATE TABLE "backlog_file" (
	"source_id" uuid,
	"path" text,
	"blob_sha" text NOT NULL,
	"kind" text NOT NULL,
	"backlog_id" text,
	"task_id" uuid,
	"milestone_id" uuid,
	"error" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_file_pkey" PRIMARY KEY("source_id","path"),
	CONSTRAINT "backlog_file_kind_check" CHECK ("kind" in ('config', 'task', 'draft', 'archived', 'milestone', 'archived_milestone'))
);
--> statement-breakpoint
CREATE TABLE "backlog_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"project_id" uuid NOT NULL,
	"connection_id" uuid,
	"mode" text NOT NULL,
	"state" text DEFAULT 'setup' NOT NULL,
	"folder_override" text,
	"folder" text,
	"default_branch" text,
	"prefix" text,
	"config" jsonb,
	"mappings" jsonb DEFAULT '{"status":[],"priority":[],"assignee":[]}' NOT NULL,
	"head_commit" text,
	"last_read_commit" text,
	"last_read_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_trigger" text,
	"last_error" text,
	"warnings" jsonb DEFAULT '[]' NOT NULL,
	"webhook_id" text NOT NULL,
	"webhook_secret_ciphertext" text,
	"webhook_last_at" timestamp with time zone,
	"detached_at" timestamp with time zone,
	"detached_by_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_source_mode_check" CHECK ("mode" in ('mirror', 'import')),
	CONSTRAINT "backlog_source_state_check" CHECK ("state" in ('setup', 'reading', 'healthy', 'warnings', 'failed', 'paused', 'detached')),
	CONSTRAINT "backlog_source_last_trigger_check" CHECK ("last_trigger" in ('setup', 'webhook', 'manual', 'cli', 'poll')),
	CONSTRAINT "backlog_source_detached_check" CHECK (("state" = 'detached') = ("detached_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "git_connection" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"host" text NOT NULL,
	"api_base_url" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_hint" text NOT NULL,
	"status" text DEFAULT 'unchecked' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_login" text,
	"checked_detail" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_connection_name_check" CHECK (char_length("name") between 1 and 100),
	CONSTRAINT "git_connection_provider_check" CHECK ("provider" in ('github', 'gitlab', 'gitea')),
	CONSTRAINT "git_connection_status_check" CHECK ("status" in ('unchecked', 'working', 'rejected', 'unreachable')),
	CONSTRAINT "git_connection_host_check" CHECK ("host" = lower("host") and "host" <> '')
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "origin" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "origin_ref" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "backlog_id" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "key_suffix" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "backlog_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "backlog_data" jsonb;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_projectId_number_keySuffix_unique" UNIQUE NULLS NOT DISTINCT("project_id","number","key_suffix");--> statement-breakpoint
-- Moved by hand (drizzle-kit drops first): the old index goes only once the new constraint holds.
DROP INDEX "task_projectId_number_unique";--> statement-breakpoint
CREATE INDEX "milestone_projectId_backlogId_idx" ON "milestone" ("project_id","backlog_id");--> statement-breakpoint
CREATE INDEX "task_projectId_backlogId_idx" ON "task" ("project_id","backlog_id");--> statement-breakpoint
CREATE INDEX "task_projectId_hidden_idx" ON "task" ("project_id") WHERE "hidden_at" is not null;--> statement-breakpoint
CREATE INDEX "backlog_file_sourceId_backlogId_idx" ON "backlog_file" ("source_id","backlog_id");--> statement-breakpoint
CREATE INDEX "backlog_file_taskId_idx" ON "backlog_file" ("task_id");--> statement-breakpoint
CREATE INDEX "backlog_file_milestoneId_idx" ON "backlog_file" ("milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_source_projectId_unique" ON "backlog_source" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_source_webhookId_unique" ON "backlog_source" ("webhook_id");--> statement-breakpoint
CREATE INDEX "backlog_source_connectionId_idx" ON "backlog_source" ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "git_connection_workspaceId_name_unique" ON "git_connection" ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "backlog_file" ADD CONSTRAINT "backlog_file_source_id_backlog_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "backlog_source"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "backlog_file" ADD CONSTRAINT "backlog_file_task_id_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "backlog_file" ADD CONSTRAINT "backlog_file_milestone_id_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestone"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "backlog_source" ADD CONSTRAINT "backlog_source_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "backlog_source" ADD CONSTRAINT "backlog_source_connection_id_git_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "git_connection"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "backlog_source" ADD CONSTRAINT "backlog_source_detached_by_id_user_id_fkey" FOREIGN KEY ("detached_by_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "backlog_source" ADD CONSTRAINT "backlog_source_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "git_connection" ADD CONSTRAINT "git_connection_workspace_id_organization_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "git_connection" ADD CONSTRAINT "git_connection_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_origin_check" CHECK ("origin" in ('app', 'backlog'));--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_key_suffix_check" CHECK ("key_suffix" ~ '^[1-9][0-9]{0,4}(\.[1-9][0-9]{0,4})*$');