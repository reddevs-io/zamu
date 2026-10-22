import { z } from 'zod';
import {
  ApiKeyAccess,
  AuthId,
  Priority,
  ProjectId,
  ProjectKey,
  RowId,
  TaskKey,
  TaskStatus,
  Timestamp,
  UserId,
  UserKind,
  WorkspaceId,
  WorkspaceRole,
} from './primitives';

// Output schemas. Servers may pass Dates where a Timestamp is expected; clients always receive
// ISO strings. Use z.input<> for what a server hands in and z.output<> (the exported types) for
// what a client reads.

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** Minimal user reference used inside other entities. */
export const UserRef = z.object({
  id: UserId,
  name: z.string(),
  kind: UserKind,
});
export type UserRef = z.output<typeof UserRef>;

/** An assignee: agents carry their responsible human, so the UI can show "claude-dev for Ana Ruiz". */
export const AssigneeRef = UserRef.extend({
  responsible: UserRef.nullable(),
});
export type AssigneeRef = z.output<typeof AssigneeRef>;

export const ProjectRef = z.object({
  id: ProjectId,
  key: ProjectKey,
  name: z.string(),
});
export type ProjectRef = z.output<typeof ProjectRef>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const Project = z.object({
  id: ProjectId,
  key: ProjectKey,
  name: z.string(),
  description: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Project = z.output<typeof Project>;

/** Open task counts of a project, one entry per open status. */
export const OpenStatusCounts = z.object({
  backlog: z.number().int().nonnegative(),
  todo: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  in_review: z.number().int().nonnegative(),
});
export type OpenStatusCounts = z.output<typeof OpenStatusCounts>;

/** Task counts for every status. */
export const StatusCounts = OpenStatusCounts.extend({
  done: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative(),
});
export type StatusCounts = z.output<typeof StatusCounts>;

/** A project as listed on the projects screen and in the rail. */
export const ProjectWithCounts = Project.extend({
  /** Open tasks per status (backlog, todo, in progress, in review). */
  openCounts: OpenStatusCounts,
  /** Sum of openCounts. */
  openCount: z.number().int().nonnegative(),
  /** Latest of the project's and its tasks' updatedAt. Sorts the projects screen. */
  lastActivityAt: Timestamp,
  /** Distinct assignees of open tasks, people first, for the avatar stack. */
  assignees: z.array(UserRef),
});
export type ProjectWithCounts = z.output<typeof ProjectWithCounts>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const Task = z.object({
  id: RowId,
  key: TaskKey,
  number: z.number().int().positive(),
  project: ProjectRef,
  title: z.string(),
  /** Markdown. */
  description: z.string().nullable(),
  status: TaskStatus,
  priority: Priority,
  assignee: AssigneeRef.nullable(),
  createdBy: UserRef,
  /** The responsible human when an agent created the task; null for people. */
  createdOnBehalfOf: UserRef.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Task = z.output<typeof Task>;

/** A row in the task list: no description, no project (the list is per project). */
export const TaskListItem = Task.pick({
  id: true,
  key: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  assignee: true,
  createdAt: true,
  updatedAt: true,
});
export type TaskListItem = z.output<typeof TaskListItem>;

/** One page of tasks. counts covers every task matching the filters, ignoring the status filter. */
export const TaskListPage = z.object({
  items: z.array(TaskListItem),
  /** Pass as `cursor` to fetch the next page; null on the last page. */
  nextCursor: z.string().nullable(),
  counts: StatusCounts,
});
export type TaskListPage = z.output<typeof TaskListPage>;

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = ['task.created', 'task.updated'] as const;
export const ActivityType = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityType>;

/**
 * One field change. The API resolves the assignee to a user reference; the database row stores
 * user ids, and core resolves them when reading.
 */
export const ActivityChange = z.discriminatedUnion('field', [
  z.object({ field: z.literal('title'), from: z.string().nullable(), to: z.string().nullable() }),
  z.object({ field: z.literal('description'), from: z.string().nullable(), to: z.string().nullable() }),
  z.object({ field: z.literal('status'), from: TaskStatus.nullable(), to: TaskStatus.nullable() }),
  z.object({ field: z.literal('priority'), from: Priority.nullable(), to: Priority.nullable() }),
  z.object({ field: z.literal('assignee'), from: UserRef.nullable(), to: UserRef.nullable() }),
]);
export type ActivityChange = z.output<typeof ActivityChange>;

export const Activity = z.object({
  id: RowId,
  type: ActivityType,
  taskKey: TaskKey,
  actor: UserRef,
  /** The agent's responsible human at the time of the change; null for people. */
  onBehalfOf: UserRef.nullable(),
  /** For task.created: the initial values that differ from the defaults. */
  changes: z.array(ActivityChange),
  createdAt: Timestamp,
});
export type Activity = z.output<typeof Activity>;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const Member = z.object({
  id: UserId,
  name: z.string(),
  /** Null for agents: their Better Auth email is synthetic and never shown. */
  email: z.string().nullable(),
  kind: UserKind,
  role: WorkspaceRole,
  /** Agents only: the person they act for. Null for people. */
  responsible: UserRef.nullable(),
  /** Last activity row written by this member, or null when none exists. */
  lastActiveAt: Timestamp.nullable(),
  /** Active (not revoked) API keys owned by this member. */
  apiKeyCount: z.number().int().nonnegative(),
  joinedAt: Timestamp,
});
export type Member = z.output<typeof Member>;

export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'canceled', 'expired'] as const;
export const InvitationStatus = z.enum(INVITATION_STATUSES);
export type InvitationStatus = z.infer<typeof InvitationStatus>;

/** A workspace invitation. No email is sent in M1: admins copy the link. */
export const Invitation = z.object({
  id: AuthId,
  email: z.string(),
  role: WorkspaceRole,
  status: InvitationStatus,
  invitedBy: UserRef,
  /** Accept link. Present only when the caller may share it (admins). */
  link: z.url().nullable(),
  expiresAt: Timestamp,
  createdAt: Timestamp,
});
export type Invitation = z.output<typeof Invitation>;

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const API_KEY_PREFIX = 'pm_live_';

/** Full API key secret. Only ever present in ApiKeyCreated and in client config. */
export const ApiKeySecret = z
  .string()
  .regex(/^pm_live_[A-Za-z0-9_-]{16,}$/, 'API keys start with pm_live_ followed by at least 16 characters');

/** Projects an API key may touch: the whole workspace, or a non-empty list of project ids. */
export const ApiKeyProjects = z.union([z.literal('all'), z.array(ProjectId).min(1)]);
export type ApiKeyProjects = z.output<typeof ApiKeyProjects>;

/** Scope chosen when creating a key. */
export const ApiKeyScope = z.object({
  projects: ApiKeyProjects,
  access: ApiKeyAccess,
});
export type ApiKeyScope = z.output<typeof ApiKeyScope>;

/** What core stores in Better Auth's apikey.metadata. */
export const ApiKeyMetadata = ApiKeyScope.extend({
  workspaceId: WorkspaceId,
});
export type ApiKeyMetadata = z.output<typeof ApiKeyMetadata>;

/** Scope as shown to people: project ids resolved to references. */
export const ApiKeyScopeView = z.object({
  projects: z.union([z.literal('all'), z.array(ProjectRef)]),
  access: ApiKeyAccess,
});
export type ApiKeyScopeView = z.output<typeof ApiKeyScopeView>;

/** An API key without its secret. */
export const ApiKeySummary = z.object({
  id: AuthId,
  name: z.string(),
  /** First characters of the key for recognition, e.g. `pm_live_4kQz`. */
  start: z.string().nullable(),
  owner: UserRef,
  scope: ApiKeyScopeView,
  revoked: z.boolean(),
  createdAt: Timestamp,
  lastUsedAt: Timestamp.nullable(),
  expiresAt: Timestamp.nullable(),
});
export type ApiKeySummary = z.output<typeof ApiKeySummary>;

/** Returned once, right after creation: the only time the secret leaves the server. */
export const ApiKeyCreated = ApiKeySummary.extend({
  key: ApiKeySecret,
});
export type ApiKeyCreated = z.output<typeof ApiKeyCreated>;

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export const AuthMethod = z.enum(['session', 'api_key']);
export type AuthMethod = z.infer<typeof AuthMethod>;

/** The caller: who they are, in which workspace, and how far their credentials reach. */
export const Me = z.object({
  user: z.object({
    id: UserId,
    name: z.string(),
    /** Null for agents (synthetic address). */
    email: z.string().nullable(),
    kind: UserKind,
    responsible: UserRef.nullable(),
  }),
  workspace: z.object({
    id: WorkspaceId,
    name: z.string(),
    slug: z.string(),
  }),
  role: WorkspaceRole,
  auth: z.object({
    method: AuthMethod,
    /** Null for sessions (full member rights); the key's scope for API keys. */
    scope: ApiKeyScopeView.nullable(),
  }),
});
export type Me = z.output<typeof Me>;

// ---------------------------------------------------------------------------
// List wrappers
// ---------------------------------------------------------------------------

export const ProjectList = z.object({ items: z.array(ProjectWithCounts) });
export type ProjectList = z.output<typeof ProjectList>;

export const ActivityList = z.object({ items: z.array(Activity) });
export type ActivityList = z.output<typeof ActivityList>;

export const MemberList = z.object({ items: z.array(Member) });
export type MemberList = z.output<typeof MemberList>;
