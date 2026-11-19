// M3 tables: git connections and the Backlog.md mirror. See section 5 "Domain model and behaviour"
// of the M3 plan. Enumerations are text columns with check constraints (like user.theme), so a
// later value is a constraint change rather than an ALTER TYPE.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { milestone, project, task } from './app';
import { organization, user } from './auth';

/** Builds `column in ('a', 'b')` for a check constraint. Values are constants, never input. */
function oneOf(column: unknown, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;
}

export const GIT_PROVIDERS = ['github', 'gitlab', 'gitea'] as const;
export type GitProviderName = (typeof GIT_PROVIDERS)[number];

export const GIT_CONNECTION_STATUSES = ['unchecked', 'working', 'rejected', 'unreachable'] as const;
export type GitConnectionStatus = (typeof GIT_CONNECTION_STATUSES)[number];

export const BACKLOG_MODES = ['mirror', 'import'] as const;
export type BacklogMode = (typeof BACKLOG_MODES)[number];

export const BACKLOG_STATES = [
  'setup',
  'reading',
  'healthy',
  'warnings',
  'failed',
  'paused',
  'detached',
] as const;
export type BacklogState = (typeof BACKLOG_STATES)[number];

export const BACKLOG_TRIGGERS = ['setup', 'webhook', 'manual', 'cli', 'poll'] as const;
export type BacklogTrigger = (typeof BACKLOG_TRIGGERS)[number];

export const BACKLOG_FILE_KINDS = [
  'config',
  'task',
  'draft',
  'archived',
  'milestone',
  'archived_milestone',
] as const;
export type BacklogFileKind = (typeof BACKLOG_FILE_KINDS)[number];

/**
 * backlog_source.mappings. The contract shape (BacklogMappings in @zamu/contracts) validates it on
 * every write; the database only stores it.
 */
export interface StoredBacklogMappings {
  status: { from: string; to: string; how: string }[];
  priority: { from: string; to: string; how: string }[];
  assignee: { from: string; userId: string | null; how: string }[];
}

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

/** A workspace's access token for one git host. Many projects can read through one connection. */
export const gitConnection = pgTable(
  'git_connection',
  {
    id: uuid('id').default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Unique per workspace ignoring case. */
    name: text('name').notNull(),
    provider: text('provider', { enum: GIT_PROVIDERS }).notNull(),
    /** Lowercase host, optionally with a port; no scheme or path. */
    host: text('host').notNull(),
    /** Derived from provider and host when saved (https://api.github.com, https://host/api/v4, ...). */
    apiBaseUrl: text('api_base_url').notNull(),
    /** AES-256-GCM under APP_ENCRYPTION_KEY, `v1:` + base64(iv ‖ ciphertext ‖ tag). */
    tokenCiphertext: text('token_ciphertext').notNull(),
    /** Last 3 characters of the token, for recognition. */
    tokenHint: text('token_hint').notNull(),
    status: text('status', { enum: GIT_CONNECTION_STATUSES }).default('unchecked').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    /** The login the token belongs to, from the last working check. */
    checkedLogin: text('checked_login'),
    /** Short, token-free reason of the last failed check. */
    checkedDetail: text('checked_detail'),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('git_connection_workspaceId_name_unique').on(table.workspaceId, sql`lower(${table.name})`),
    check('git_connection_name_check', sql`char_length(${table.name}) between 1 and 100`),
    check('git_connection_provider_check', oneOf(table.provider, GIT_PROVIDERS)),
    check('git_connection_status_check', oneOf(table.status, GIT_CONNECTION_STATUSES)),
    check('git_connection_host_check', sql`${table.host} = lower(${table.host}) and ${table.host} <> ''`),
  ],
);

/** The link between one project and a Backlog.md folder: mode, mappings and refresh state. */
export const backlogSource = pgTable(
  'backlog_source',
  {
    id: uuid('id').default(sql`uuidv7()`).primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** Null once the connection is deleted; the source is paused then. */
    connectionId: uuid('connection_id').references(() => gitConnection.id, { onDelete: 'set null' }),
    mode: text('mode', { enum: BACKLOG_MODES }).notNull(),
    state: text('state', { enum: BACKLOG_STATES }).default('setup').notNull(),
    /** The folder chosen by hand; null means detect it. */
    folderOverride: text('folder_override'),
    /** The folder the last read used (backlog, .backlog, or a configured one). */
    folder: text('folder'),
    defaultBranch: text('default_branch'),
    /** task_prefix from config.yml in uppercase (BACK). */
    prefix: text('prefix'),
    /** Summary of config.yml: statuses, priorities, milestones seen. */
    config: jsonb('config').$type<Record<string, unknown>>(),
    mappings: jsonb('mappings')
      .$type<StoredBacklogMappings>()
      .default({ status: [], priority: [], assignee: [] })
      .notNull(),
    /** Head of the default branch at the last attempt. */
    headCommit: text('head_commit'),
    /** The commit the last successful read applied. */
    lastReadCommit: text('last_read_commit'),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastTrigger: text('last_trigger', { enum: BACKLOG_TRIGGERS }),
    /** Why the last refresh failed or the source paused. Never contains a token. */
    lastError: text('last_error'),
    /** Value fallbacks and other warnings of the last read (BacklogProblem[] in @zamu/contracts). */
    warnings: jsonb('warnings').$type<Record<string, unknown>[]>().default([]).notNull(),
    /** Random, URL-safe: POST /api/webhooks/backlog/{webhookId}. Kept after detach (the URL answers 410). */
    webhookId: text('webhook_id').notNull(),
    /** Encrypted like git_connection.token_ciphertext. Dropped on detach. */
    webhookSecretCiphertext: text('webhook_secret_ciphertext'),
    webhookLastAt: timestamp('webhook_last_at', { withTimezone: true }),
    detachedAt: timestamp('detached_at', { withTimezone: true }),
    detachedById: uuid('detached_by_id').references(() => user.id, { onDelete: 'restrict' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('backlog_source_projectId_unique').on(table.projectId),
    uniqueIndex('backlog_source_webhookId_unique').on(table.webhookId),
    index('backlog_source_connectionId_idx').on(table.connectionId),
    check('backlog_source_mode_check', oneOf(table.mode, BACKLOG_MODES)),
    check('backlog_source_state_check', oneOf(table.state, BACKLOG_STATES)),
    check('backlog_source_last_trigger_check', oneOf(table.lastTrigger, BACKLOG_TRIGGERS)),
    check(
      'backlog_source_detached_check',
      sql`(${table.state} = 'detached') = (${table.detachedAt} is not null)`,
    ),
  ],
);

/** One row per file under the folder at the last read. Drives incremental reads and the problem list. */
export const backlogFile = pgTable(
  'backlog_file',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => backlogSource.id, { onDelete: 'cascade' }),
    /** Repository path, e.g. backlog/tasks/back-786 - Add webhooks.md. */
    path: text('path').notNull(),
    /** Git blob hash; an unchanged hash skips the download. */
    blobSha: text('blob_sha').notNull(),
    kind: text('kind', { enum: BACKLOG_FILE_KINDS }).notNull(),
    /** The Backlog.md id read from the file (BACK-786.1, m-3); null for config or unreadable files. */
    backlogId: text('backlog_id'),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    milestoneId: uuid('milestone_id').references(() => milestone.id, { onDelete: 'set null' }),
    /** Why the file was skipped; null when it was read. */
    error: text('error'),
    seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.path] }),
    index('backlog_file_sourceId_backlogId_idx').on(table.sourceId, table.backlogId),
    index('backlog_file_taskId_idx').on(table.taskId),
    index('backlog_file_milestoneId_idx').on(table.milestoneId),
    check('backlog_file_kind_check', oneOf(table.kind, BACKLOG_FILE_KINDS)),
  ],
);
