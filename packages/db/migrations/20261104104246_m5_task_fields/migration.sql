CREATE TABLE "label" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" smallint NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "label_name_check" CHECK (char_length("name") between 1 and 40),
	CONSTRAINT "label_color_check" CHECK ("color" between 1 and 9),
	CONSTRAINT "label_source_check" CHECK ("source" in ('app', 'backlog'))
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"task_id" uuid,
	"blocker_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependency_pkey" PRIMARY KEY("task_id","blocker_id"),
	CONSTRAINT "task_dependency_self_check" CHECK ("task_id" <> "blocker_id")
);
--> statement-breakpoint
CREATE TABLE "task_label" (
	"task_id" uuid,
	"label_id" uuid,
	CONSTRAINT "task_label_pkey" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "label_projectId_name_unique" ON "label" ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_projectId_dueDate_idx" ON "task" ("project_id","due_date") WHERE "due_date" is not null;--> statement-breakpoint
CREATE INDEX "task_parentId_idx" ON "task" ("parent_id");--> statement-breakpoint
CREATE INDEX "task_dependency_blockerId_idx" ON "task_dependency" ("blocker_id");--> statement-breakpoint
CREATE INDEX "task_label_labelId_idx" ON "task_label" ("label_id");--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_workspace_id_organization_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_id_task_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "task"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_task_id_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_blocker_id_task_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "task"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_task_id_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_label_id_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "label"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_check" CHECK ("parent_id" <> "id");