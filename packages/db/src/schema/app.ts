// Application tables: projects, tasks and their activity. See section 5 "Domain model" of the M1 plan.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth';

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Priority is stored as 0 to 4: none, low, medium, high, urgent. */
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 4;

export const ACTIVITY_TYPES = ['task.created', 'task.updated'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** One entry of activity.changes. */
export interface ActivityChange {
  field: string;
  from: unknown;
  to: unknown;
}

export const taskStatus = pgEnum('task_status', TASK_STATUSES);

const id = () => uuid('id').default(sql`uuidv7()`).primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const project = pgTable(
  'project',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** 2 to 6 characters, A-Z and 0-9, starting with a letter. Unique per workspace. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Next task number; taken with UPDATE ... RETURNING inside the task insert transaction. */
    nextTaskNumber: integer('next_task_number').default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('project_workspaceId_key_unique').on(table.workspaceId, table.key),
    check('project_key_check', sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,5}$'`),
    check('project_next_task_number_check', sql`${table.nextTaskNumber} >= 1`),
  ],
);

export const task = pgTable(
  'task',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** Per-project counter; the task key is `${project.key}-${number}`. */
    number: integer('number').notNull(),
    title: text('title').notNull(),
    /** Markdown. */
    description: text('description'),
    status: taskStatus('status').default('todo').notNull(),
    priority: smallint('priority').default(0).notNull(),
    assigneeId: uuid('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** The responsible human when an agent created the task, otherwise null. */
    createdOnBehalfOfId: uuid('created_on_behalf_of_id').references(() => user.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('task_projectId_number_unique').on(table.projectId, table.number),
    index('task_projectId_status_idx').on(table.projectId, table.status),
    index('task_assigneeId_idx').on(table.assigneeId),
    check('task_priority_check', sql`${table.priority} between 0 and 4`),
    check('task_number_check', sql`${table.number} >= 1`),
  ],
);

export const activity = pgTable(
  'activity',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** Null is reserved for project-level events; every M1 type refers to a task. */
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** The agent's responsible human; null when a person acted. */
    onBehalfOfId: uuid('on_behalf_of_id').references(() => user.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    changes: jsonb('changes').$type<ActivityChange[]>().default([]).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('activity_taskId_createdAt_idx').on(table.taskId, table.createdAt),
    index('activity_projectId_createdAt_idx').on(table.projectId, table.createdAt),
  ],
);
