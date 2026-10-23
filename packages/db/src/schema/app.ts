// Application tables: projects, tasks, milestones, cycles, comments and activity.
// See section 5 "Domain model" of the M1 plan and section 5 "Domain model changes" of the M2 plan.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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

export const ACTIVITY_TYPES = ['task.created', 'task.updated', 'cycle.ended'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** One entry of activity.changes. */
export interface ActivityChange {
  field: string;
  from: unknown;
  to: unknown;
}

export const MILESTONE_STATUSES = ['planned', 'active', 'completed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Longest cycle in days, both ends included. */
export const MAX_CYCLE_DAYS = 56;

export const taskStatus = pgEnum('task_status', TASK_STATUSES);
export const milestoneStatus = pgEnum('milestone_status', MILESTONE_STATUSES);

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
    /** Turning a feature off hides it in the UI and API inputs; the data stays. */
    usesMilestones: boolean('uses_milestones').default(true).notNull(),
    usesCycles: boolean('uses_cycles').default(true).notNull(),
    /** Next cycle number; taken like nextTaskNumber, under the project row lock. */
    nextCycleNumber: integer('next_cycle_number').default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('project_workspaceId_key_unique').on(table.workspaceId, table.key),
    check('project_key_check', sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,5}$'`),
    check('project_next_task_number_check', sql`${table.nextTaskNumber} >= 1`),
    check('project_next_cycle_number_check', sql`${table.nextCycleNumber} >= 1`),
  ],
);

export const milestone = pgTable(
  'milestone',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** 1 to 100 characters, unique per project ignoring case. */
    name: text('name').notNull(),
    /** Markdown. */
    description: text('description'),
    /** Calendar date, no time zone. */
    targetDate: date('target_date', { mode: 'string' }),
    status: milestoneStatus('status').default('planned').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('milestone_projectId_name_unique').on(table.projectId, sql`lower(${table.name})`),
    check('milestone_name_check', sql`char_length(${table.name}) between 1 and 100`),
  ],
);

export const cycle = pgTable(
  'cycle',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** Per-project counter from project.next_cycle_number: Cycle 12. */
    number: integer('number').notNull(),
    name: text('name'),
    /** First day, included. */
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    /** Last day, included. The cycle ends at midnight after it, in APP_TIME_ZONE. */
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    /** Set when the cycle ends, by hand or by the hourly job. State is derived from it and the dates. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Who ended the cycle; null when the hourly job did (or while it runs). */
    endedById: uuid('ended_by_id').references(() => user.id, { onDelete: 'restrict' }),
    // Summary written when the cycle ends; null before.
    scopeCount: integer('scope_count'),
    completedCount: integer('completed_count'),
    rolledOverCount: integer('rolled_over_count'),
    canceledCount: integer('canceled_count'),
    addedAfterStartCount: integer('added_after_start_count'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('cycle_projectId_number_unique').on(table.projectId, table.number),
    check('cycle_number_check', sql`${table.number} >= 1`),
    check(
      'cycle_dates_check',
      sql`${table.endsOn} >= ${table.startsOn} and ${table.endsOn} - ${table.startsOn} < ${sql.raw(String(MAX_CYCLE_DAYS))}`,
    ),
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
    milestoneId: uuid('milestone_id').references((): AnyPgColumn => milestone.id, { onDelete: 'set null' }),
    cycleId: uuid('cycle_id').references((): AnyPgColumn => cycle.id, { onDelete: 'set null' }),
    /** Set whenever cycle_id changes. Later than the start of starts_on means "added after start". */
    cycleAddedAt: timestamp('cycle_added_at', { withTimezone: true }),
    /**
     * Position inside the task's status column on the board, ascending. Core sets it explicitly
     * (new tasks: column minimum - 1; moves: midpoint of the neighbours). The default only keeps
     * raw inserts (seeds, tests) valid.
     */
    rank: doublePrecision('rank').default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('task_projectId_number_unique').on(table.projectId, table.number),
    index('task_projectId_status_idx').on(table.projectId, table.status),
    index('task_projectId_status_rank_idx').on(table.projectId, table.status, table.rank),
    index('task_assigneeId_idx').on(table.assigneeId),
    index('task_milestoneId_idx').on(table.milestoneId),
    index('task_cycleId_idx').on(table.cycleId),
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
    /** Null means the system: the hourly job that ends cycles. */
    actorId: uuid('actor_id').references(() => user.id, { onDelete: 'restrict' }),
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

/** One row per unfinished task when a cycle ends. The completed cycle page reads them. */
export const cycleRollover = pgTable(
  'cycle_rollover',
  {
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    /** The cycle the task moved to; null when the caller chose "No cycle". */
    toCycleId: uuid('to_cycle_id').references(() => cycle.id, { onDelete: 'set null' }),
    statusAtEnd: taskStatus('status_at_end').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.cycleId, table.taskId] }),
    index('cycle_rollover_taskId_idx').on(table.taskId),
  ],
);

export const comment = pgTable(
  'comment',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** The agent's responsible human when an agent wrote it; null for people. */
    onBehalfOfId: uuid('on_behalf_of_id').references(() => user.id, { onDelete: 'restrict' }),
    /** Markdown, mentions as [@Name](mention:<userId>). Null once deleted. */
    body: text('body'),
    createdAt: createdAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    /** Soft delete: body becomes null and the timeline shows a placeholder. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('comment_taskId_createdAt_idx').on(table.taskId, table.createdAt),
    check('comment_body_check', sql`(${table.body} is null) = (${table.deletedAt} is not null)`),
  ],
);

/** Who a comment mentions. Rewritten on edit; kept for later notifications. */
export const commentMention = pgTable(
  'comment_mention',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comment.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index('comment_mention_userId_idx').on(table.userId),
  ],
);
