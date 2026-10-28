import { z } from 'zod';
import {
  ActivityOrigin,
  ApiKeyAccess,
  AuthId,
  BacklogMode,
  BacklogSourceId,
  BacklogState,
  BacklogTrigger,
  CalendarDate,
  CommentId,
  CycleId,
  CycleState,
  GitConnectionId,
  GitConnectionStatus,
  GitProvider,
  MilestoneId,
  MilestoneOwnedField,
  MilestoneStatus,
  Priority,
  ProjectId,
  ProjectKey,
  ProjectOwnedField,
  RowId,
  TaskKey,
  TaskOwnedField,
  TaskStatus,
  Theme,
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

/** A task's milestone, as shown on cards, rows and in the task panel. */
export const MilestoneRef = z.object({
  id: MilestoneId,
  name: z.string(),
  status: MilestoneStatus,
  targetDate: CalendarDate.nullable(),
});
export type MilestoneRef = z.output<typeof MilestoneRef>;

/** A task's cycle. `state` is derived from the dates and completedAt at read time. */
export const CycleRef = z.object({
  id: CycleId,
  number: z.number().int().positive(),
  name: z.string().nullable(),
  startsOn: CalendarDate,
  endsOn: CalendarDate,
  state: CycleState,
});
export type CycleRef = z.output<typeof CycleRef>;

/** The project's current cycle, for the header tab note ("C12 · 3d left"). */
export const CurrentCycle = CycleRef.omit({ state: true }).extend({
  /** Days left including today, in APP_TIME_ZONE: 1 on the last day. */
  daysLeft: z.number().int().positive(),
});
export type CurrentCycle = z.output<typeof CurrentCycle>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** Problem counts of a Backlog.md source: files skipped or read with a warning, values that fell back. */
export const BacklogProblemCounts = z.object({
  files: z.number().int().nonnegative(),
  values: z.number().int().nonnegative(),
});
export type BacklogProblemCounts = z.output<typeof BacklogProblemCounts>;

/**
 * The Backlog.md source of a project as project shapes carry it (header indicator, projects table,
 * sidebar marker). GET /projects/{key}/backlog has the full status.
 */
export const ProjectBacklogSummary = z.object({
  mode: BacklogMode,
  state: BacklogState,
  defaultBranch: z.string().nullable(),
  /** The last successful read; null before the first one finishes. */
  lastReadAt: Timestamp.nullable(),
  lastReadCommit: z.string().nullable(),
  lastTrigger: BacklogTrigger.nullable(),
  problems: BacklogProblemCounts,
  /** Tasks hidden because their file is gone from the default branch. */
  hidden: z.number().int().nonnegative(),
  /** Set once detached (imports detach right after the first read). */
  detachedAt: Timestamp.nullable(),
});
export type ProjectBacklogSummary = z.output<typeof ProjectBacklogSummary>;

// The defaults on fields added in M2 keep servers that do not send them yet valid; clients always
// receive the fields.
export const Project = z.object({
  id: ProjectId,
  key: ProjectKey,
  name: z.string(),
  description: z.string().nullable(),
  /** Off hides the milestones tab, filter and fields. The data stays. */
  usesMilestones: z.boolean().default(true),
  /** Off hides the cycles tab, filter and fields. The data stays. */
  usesCycles: z.boolean().default(true),
  /** Null when the project has no current cycle or does not use cycles. */
  currentCycle: CurrentCycle.nullable().default(null),
  /**
   * Clone URL of the linked git repository, as entered (M2.1). parseRepositoryUrl gives its short
   * form and web page. The CLI picks this project inside a clone whose remote matches.
   */
  repository: z.string().nullable().default(null),
  // M3 fields are optional in the type, so shapes built before M3 (fixtures, fakes) stay valid.
  // Servers from M3 on always send them; read a missing one as null, [] or false.
  /** M3: the project's Backlog.md source, detached ones included; null when there is none. */
  backlog: ProjectBacklogSummary.nullable().optional(),
  /**
   * M3: project fields the mirror constrains right now (key, repository, usesMilestones). Empty
   * unless the project mirrors Backlog.md.
   */
  locked: z.array(ProjectOwnedField).optional(),
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
// Backlog.md block on tasks (M3)
// ---------------------------------------------------------------------------

/** Where a Backlog.md task file lives: tasks/, drafts/, or archive/tasks (legacy completed/ too). */
export const BACKLOG_TASK_KINDS = ['task', 'draft', 'archived'] as const;
export const BacklogTaskKind = z.enum(BACKLOG_TASK_KINDS);
export type BacklogTaskKind = z.infer<typeof BacklogTaskKind>;

/** One assignee value from the file and the member it matched (null: matches no member). */
export const BacklogAssigneeValue = z.object({
  value: z.string(),
  userId: UserId.nullable(),
});
export type BacklogAssigneeValue = z.output<typeof BacklogAssigneeValue>;

/**
 * task.backlog_data: the Backlog.md fields the app has no column for, plus the raw values of the
 * mapped ones. Written by the refresh, never by people. Ids are canonical Backlog.md ids (BACK-12).
 * Every field has a default so older rows stay readable when fields are added.
 */
export const BacklogBlock = z.object({
  kind: BacklogTaskKind.default('task'),
  /** Raw values as written in the file, before mapping. */
  status: z.string().nullable().default(null),
  priority: z.string().nullable().default(null),
  milestone: z.string().nullable().default(null),
  /** Every assignee value in file order; the first one with a userId is the task's assignee. */
  assignees: z.array(BacklogAssigneeValue).default([]),
  reporter: z.string().nullable().default(null),
  labels: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  parentId: z.string().nullable().default(null),
  subtasks: z.array(z.string()).default([]),
  /** As written: a date or a date and time. */
  dueDate: z.string().nullable().default(null),
  type: z.string().nullable().default(null),
  references: z.array(z.string()).default([]),
  documentation: z.array(z.string()).default([]),
  modifiedFiles: z.array(z.string()).default([]),
  /** created_date as written (the task's createdAt holds the parsed value). */
  createdDate: z.string().nullable().default(null),
  /** updated_date, parsed. The task's own updatedAt stays the app's write time. */
  updatedDate: Timestamp.nullable().default(null),
  ordinal: z.number().nullable().default(null),
  /** Frontmatter keys the parser does not know, kept as read. */
  other: z.record(z.string(), z.unknown()).default({}),
});
export type BacklogBlock = z.output<typeof BacklogBlock>;

/** A Backlog.md id resolved to a task of the same project at read time; task null: no task with this id. */
export const BacklogTaskLink = z.object({
  id: z.string(),
  task: z
    .object({
      key: TaskKey,
      title: z.string(),
      status: TaskStatus,
      hidden: z.boolean(),
    })
    .nullable(),
});
export type BacklogTaskLink = z.output<typeof BacklogTaskLink>;

/** The Backlog.md block as task shapes carry it: ids resolved to tasks, assignee values to members. */
export const BacklogBlockView = BacklogBlock.omit({
  assignees: true,
  dependencies: true,
  parentId: true,
  subtasks: true,
}).extend({
  assignees: z.array(z.object({ value: z.string(), user: UserRef.nullable() })),
  dependencies: z.array(BacklogTaskLink),
  parent: BacklogTaskLink.nullable(),
  subtasks: z.array(BacklogTaskLink),
});
export type BacklogBlockView = z.output<typeof BacklogBlockView>;

/** Where a task came from in Backlog.md. Kept after detach as a read-only record. */
export const TaskBacklog = z.object({
  /** Canonical Backlog.md id: BACK-786.1. */
  id: z.string(),
  /** Repository path of the file on the default branch; null once the file is gone or after detach. */
  file: z.string().nullable(),
  /** Web page of the file on the provider ("Open file"); null when unknown. */
  fileUrl: z.string().nullable().default(null),
  data: BacklogBlockView,
});
export type TaskBacklog = z.output<typeof TaskBacklog>;

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
  milestone: MilestoneRef.nullable().default(null),
  cycle: CycleRef.nullable().default(null),
  /** When the task last entered its cycle; after the cycle's start means "added after start". */
  cycleAddedAt: Timestamp.nullable().default(null),
  /** Position inside its status column on the board, ascending. Only the order matters. */
  rank: z.number(),
  // M3 fields are optional in the type, so shapes built before M3 (fixtures, fakes) stay valid.
  // Servers from M3 on always send them; read a missing one as null, [] or false.
  /** M3: the Backlog.md origin of a mirrored or imported task; null for native tasks. */
  backlog: TaskBacklog.nullable().optional(),
  /**
   * M3: fields Backlog.md owns right now. Writes to them fail with TASK_MIRRORED. Empty for native
   * tasks and after detach.
   */
  locked: z.array(TaskOwnedField).optional(),
  /** M3: the task's file is gone from the default branch. Hidden tasks stay out of lists by default. */
  hidden: z.boolean().optional(),
  /** M3: when the task was hidden; null while visible. */
  hiddenAt: Timestamp.nullable().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Task = z.output<typeof Task>;

/** A row in the task list, on the board and on My tasks: everything but the description and creator. */
export const TaskListItem = Task.pick({
  id: true,
  key: true,
  number: true,
  project: true,
  title: true,
  status: true,
  priority: true,
  assignee: true,
  milestone: true,
  cycle: true,
  cycleAddedAt: true,
  rank: true,
  locked: true,
  hidden: true,
  hiddenAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  /** M3: canonical Backlog.md id (BACK-786.1); null for native tasks. */
  backlogId: z.string().nullable().optional(),
  /** M3: live comments, for the "removed · 3 comments" note on hidden rows. Optional. */
  commentCount: z.number().int().nonnegative().optional(),
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

/**
 * Problem code of a task write rejected because `ifUpdatedAt` is older than the stored task
 * (409). The problem data carries the current task, so the client can roll back and show it.
 */
export const TASK_CHANGED = 'TASK_CHANGED';

/** Data of the TASK_CHANGED problem. */
export const TaskChangedData = z.object({
  task: Task,
});
export type TaskChangedData = z.output<typeof TaskChangedData>;

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export const Milestone = z.object({
  id: MilestoneId,
  project: ProjectRef,
  name: z.string(),
  /** Markdown. */
  description: z.string().nullable(),
  targetDate: CalendarDate.nullable(),
  status: MilestoneStatus,
  /** When it was last marked Completed; null otherwise. */
  completedAt: Timestamp.nullable(),
  createdBy: UserRef,
  // M3 fields are optional in the type, so shapes built before M3 stay valid; servers send them.
  /** M3: the Backlog.md milestone id (m-3, or the name for legacy config milestones); null for native ones. */
  backlogId: z.string().nullable().optional(),
  /** M3: fields Backlog.md owns right now; MILESTONE_MIRRORED on writes. Empty unless mirrored. */
  locked: z.array(MilestoneOwnedField).optional(),
  /** M3: the milestone's file is gone from the default branch. */
  hidden: z.boolean().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Milestone = z.output<typeof Milestone>;

/** Task counts of a milestone. Progress is done / (total - canceled). */
export const MilestoneProgress = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  /** In progress and In review. */
  inProgress: z.number().int().nonnegative(),
  /** Backlog and Todo. */
  open: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative(),
});
export type MilestoneProgress = z.output<typeof MilestoneProgress>;

/** Done share of the non-canceled tasks, 0 to 1; 0 for an empty milestone. */
export function milestoneProgressRatio(progress: MilestoneProgress): number {
  const counted = progress.total - progress.canceled;
  return counted > 0 ? progress.done / counted : 0;
}

export const MilestoneWithProgress = Milestone.extend({
  progress: MilestoneProgress,
  /** Days from today to the target date in APP_TIME_ZONE (0 on the day, negative after); null without a target. */
  daysLeft: z.number().int().nullable(),
  /** Target date before today and not Completed. */
  overdue: z.boolean(),
});
export type MilestoneWithProgress = z.output<typeof MilestoneWithProgress>;

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

/** Live counts of the tasks currently in a cycle. */
export const CycleCounts = StatusCounts.extend({
  total: z.number().int().nonnegative(),
  /** Tasks whose cycleAddedAt is after the start of startsOn. */
  addedAfterStart: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  /** Tasks assigned to agents. */
  agents: z.number().int().nonnegative(),
});
export type CycleCounts = z.output<typeof CycleCounts>;

/** Written once when the cycle ends; the completed cycle page reads it. */
export const CycleSummary = z.object({
  /** Tasks in the cycle when it ended. */
  scope: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  rolledOver: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative(),
  addedAfterStart: z.number().int().nonnegative(),
});
export type CycleSummary = z.output<typeof CycleSummary>;

export const Cycle = z.object({
  id: CycleId,
  project: ProjectRef,
  number: z.number().int().positive(),
  name: z.string().nullable(),
  /** First day, included. */
  startsOn: CalendarDate,
  /** Last day, included; the cycle ends at the following midnight in APP_TIME_ZONE. */
  endsOn: CalendarDate,
  state: CycleState,
  /** Current cycles only: days left including today (1 on the last day). Null otherwise. */
  daysLeft: z.number().int().positive().nullable(),
  counts: CycleCounts,
  /** Set once the cycle ended. */
  completedAt: Timestamp.nullable(),
  /** Who ended it; null while not ended or when the hourly job ended it. */
  endedBy: UserRef.nullable(),
  /** Null until the cycle ends. */
  summary: CycleSummary.nullable(),
});
export type Cycle = z.output<typeof Cycle>;

/** An unfinished task moved when a cycle ended. */
export const CycleRollover = z.object({
  task: z.object({
    id: RowId,
    key: TaskKey,
    title: z.string(),
    /** Status now. */
    status: TaskStatus,
  }),
  statusAtEnd: TaskStatus,
  /** Null when the person ending the cycle chose "No cycle". */
  movedTo: CycleRef.pick({ id: true, number: true, name: true }).nullable(),
  createdAt: Timestamp,
});
export type CycleRollover = z.output<typeof CycleRollover>;

/** One cycle with the record of what rolled over (empty unless completed). */
export const CycleDetail = Cycle.extend({
  rollovers: z.array(CycleRollover),
});
export type CycleDetail = z.output<typeof CycleDetail>;

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  'task.created',
  'task.updated',
  'cycle.ended',
  // M3
  /** A refresh hid the task: its file is gone from the default branch. */
  'task.hidden',
  /** A refresh brought a hidden task back: a file with its id returned. */
  'task.restored',
  /** Project-level: the first read of a Backlog.md source (mirror or import), with counts. */
  'project.backlog_imported',
  /** Project-level: someone detached the source. */
  'project.backlog_detached',
  /** Project-level: an owner or admin issued a new webhook secret (0.6.0). */
  'project.backlog_webhook_secret_reissued',
] as const;
export const ActivityType = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityType>;

/** Types written on a task (activity.task_id set). */
export const TASK_ACTIVITY_TYPES = [
  'task.created',
  'task.updated',
  'cycle.ended',
  'task.hidden',
  'task.restored',
] as const;
export const TaskActivityType = z.enum(TASK_ACTIVITY_TYPES);
export type TaskActivityType = z.infer<typeof TaskActivityType>;

/** Types written on the project (activity.task_id null). */
export const PROJECT_ACTIVITY_TYPES = [
  'project.backlog_imported',
  'project.backlog_detached',
  'project.backlog_webhook_secret_reissued',
] as const;
export const ProjectActivityType = z.enum(PROJECT_ACTIVITY_TYPES);
export type ProjectActivityType = z.infer<typeof ProjectActivityType>;

/** A milestone inside an activity change. A deleted milestone reads as "Deleted milestone". */
export const ActivityMilestoneRef = MilestoneRef.pick({ id: true, name: true });
export type ActivityMilestoneRef = z.output<typeof ActivityMilestoneRef>;

/** A cycle inside an activity change. */
export const ActivityCycleRef = CycleRef.pick({ id: true, number: true, name: true });
export type ActivityCycleRef = z.output<typeof ActivityCycleRef>;

/**
 * One field change. The API resolves the assignee, milestone and cycle to references; the
 * database row stores ids, and core resolves them when reading.
 */
export const ActivityChange = z.discriminatedUnion('field', [
  z.object({ field: z.literal('title'), from: z.string().nullable(), to: z.string().nullable() }),
  z.object({ field: z.literal('description'), from: z.string().nullable(), to: z.string().nullable() }),
  z.object({ field: z.literal('status'), from: TaskStatus.nullable(), to: TaskStatus.nullable() }),
  z.object({ field: z.literal('priority'), from: Priority.nullable(), to: Priority.nullable() }),
  z.object({ field: z.literal('assignee'), from: UserRef.nullable(), to: UserRef.nullable() }),
  z.object({
    field: z.literal('milestone'),
    from: ActivityMilestoneRef.nullable(),
    to: ActivityMilestoneRef.nullable(),
  }),
  z.object({ field: z.literal('cycle'), from: ActivityCycleRef.nullable(), to: ActivityCycleRef.nullable() }),
]);
export type ActivityChange = z.output<typeof ActivityChange>;

export const Activity = z.object({
  id: RowId,
  type: ActivityType,
  taskKey: TaskKey,
  /**
   * Who made the change. Null means the system: the hourly job that ends cycles. A cycle.ended
   * entry carries one cycle change from the ended cycle to the one the task moved to.
   */
  actor: UserRef.nullable(),
  /** The agent's responsible human at the time of the change; null for people. */
  onBehalfOf: UserRef.nullable(),
  /** For task.created: the initial values that differ from the defaults. */
  changes: z.array(ActivityChange),
  // M3 fields are optional in the type, so shapes built before M3 stay valid; servers send them.
  /**
   * M3: app, or backlog for changes a Backlog.md refresh wrote. A null actor with origin backlog
   * is the Backlog.md actor; with origin app it is the system (the hourly cycle job). Missing: app.
   */
  origin: ActivityOrigin.optional(),
  /** M3: the commit a Backlog.md refresh read; null for app changes. */
  originRef: z.string().nullable().optional(),
  /**
   * M3: Backlog.md-only fields a refresh changed (labels, dependencies, createdAt, ...), named
   * after BacklogBlock keys or task fields; `changes` holds the mapped ones. Empty otherwise.
   */
  backlogFields: z.array(z.string()).optional(),
  createdAt: Timestamp,
});
export type Activity = z.output<typeof Activity>;

/** What a project-level entry records. project.backlog_imported fills the counts. */
export const ProjectActivityDetails = z.object({
  mode: BacklogMode.nullable().default(null),
  /** Short form of the repository read (gitlab.com/reddevs/payments). */
  repository: z.string().nullable().default(null),
  tasks: z.number().int().nonnegative().nullable().default(null),
  milestones: z.number().int().nonnegative().nullable().default(null),
});
export type ProjectActivityDetails = z.output<typeof ProjectActivityDetails>;

/**
 * A project-level history entry (no task): "Backlog.md imported 412 tasks and 6 milestones from
 * gitlab.com/reddevs/payments a1b2c3d", "Ana Ruiz detached Payments from Backlog.md".
 */
export const ProjectActivity = z.object({
  id: RowId,
  type: ProjectActivityType,
  /** Null with origin backlog: the Backlog.md actor. */
  actor: UserRef.nullable(),
  onBehalfOf: UserRef.nullable(),
  origin: ActivityOrigin,
  originRef: z.string().nullable(),
  details: ProjectActivityDetails,
  createdAt: Timestamp,
});
export type ProjectActivity = z.output<typeof ProjectActivity>;

// ---------------------------------------------------------------------------
// Comments and the timeline
// ---------------------------------------------------------------------------

/** Longest comment body in characters, after trimming. */
export const MAX_COMMENT_LENGTH = 20_000;

export const Comment = z.object({
  id: CommentId,
  taskKey: TaskKey,
  /** Only the author edits or deletes, agents included. */
  author: UserRef,
  /** The agent's responsible human when an agent wrote it; null for people. */
  onBehalfOf: UserRef.nullable(),
  /**
   * Markdown with mentions as [@Name](mention:<userId>). Null once deleted: the timeline shows
   * "Comment deleted by <author>".
   */
  body: z.string().nullable(),
  /** Members the body mentions, in order of first mention. Empty once deleted. */
  mentions: z.array(UserRef),
  createdAt: Timestamp,
  editedAt: Timestamp.nullable(),
  deletedAt: Timestamp.nullable(),
});
export type Comment = z.output<typeof Comment>;

/** One entry of a task's history: activity and comments in one list, oldest first. */
export const TimelineItem = z.discriminatedUnion('kind', [
  Activity.extend({ kind: z.literal('activity') }),
  Comment.extend({ kind: z.literal('comment') }),
]);
export type TimelineItem = z.output<typeof TimelineItem>;

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

/** What creating an agent returns: the member and its first API key, with the secret (shown once). */
export const AgentCreated = z.object({
  agent: Member,
  /** The agent's first API key, with its secret. Shown once. */
  key: ApiKeyCreated,
});
export type AgentCreated = z.output<typeof AgentCreated>;

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
    /** People choose it; agents keep "system". */
    theme: Theme.default('system'),
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
// Dashboard
// ---------------------------------------------------------------------------

export const DASHBOARD_SCOPES = ['mine', 'everyone'] as const;
/**
 * mine: tasks assigned to the caller or to the agents they are responsible for, and mentions of
 * the caller. everyone: every task and mention in the projects the caller can read.
 */
export const DashboardScope = z.enum(DASHBOARD_SCOPES);
export type DashboardScope = z.infer<typeof DashboardScope>;

/** Most items a queue group returns. `total` still counts every item. */
export const DASHBOARD_GROUP_ITEM_LIMIT = 50;

const count = z.number().int().nonnegative();

/** A project as named inside dashboard rows. */
export const DashboardProjectRef = ProjectRef.pick({ key: true, name: true });
export type DashboardProjectRef = z.output<typeof DashboardProjectRef>;

/** A task as shown in a dashboard row. */
export const DashboardTask = Task.pick({ key: true, title: true, status: true, priority: true }).extend({
  project: DashboardProjectRef,
});
export type DashboardTask = z.output<typeof DashboardTask>;

/** Done over total, as the source screen shows it. */
export const DashboardProgress = z.object({
  done: count,
  total: count,
});
export type DashboardProgress = z.output<typeof DashboardProgress>;

/** A task in review, waiting for someone to look at it. */
export const ReviewItem = z.object({
  task: DashboardTask,
  assignee: AssigneeRef.nullable(),
  /** When the task last entered In review; its updatedAt when no activity records it. */
  since: Timestamp,
});
export type ReviewItem = z.output<typeof ReviewItem>;

/** The newest unanswered comment that mentions a member on an open task. */
export const MentionItem = z.object({
  task: DashboardTask,
  comment: z.object({
    id: CommentId,
    /** Plain text, at most 200 characters plus an ellipsis. Inline code keeps its backticks. */
    excerpt: z.string(),
    createdAt: Timestamp,
  }),
  author: UserRef,
  /** The agent's responsible human when an agent wrote the comment; null for people. */
  onBehalfOf: UserRef.nullable(),
  /** Who has to answer. */
  mentioned: AssigneeRef,
});
export type MentionItem = z.output<typeof MentionItem>;

/** An in-progress task without an update or comment for longer than its threshold. */
export const StalledItem = z.object({
  task: DashboardTask,
  assignee: AssigneeRef.nullable(),
  /** Later of the task's updatedAt and its newest comment. */
  lastTouchedAt: Timestamp,
  /** 24 when an agent holds the task, 120 otherwise. */
  thresholdHours: z.number().int().positive(),
});
export type StalledItem = z.output<typeof StalledItem>;

/**
 * A milestone past its target date, or a current cycle ending within 2 days, that still has open
 * tasks. Milestone progress leaves canceled tasks out of total, like the milestones screen; cycle
 * progress counts every task in the cycle, like the cycles screen.
 */
export const DeadlineItem = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('milestone'),
    project: DashboardProjectRef,
    milestone: MilestoneRef.pick({ id: true, name: true }).extend({ targetDate: CalendarDate }),
    /** Days since the target date in APP_TIME_ZONE: 1 the day after it. */
    daysOverdue: z.number().int().positive(),
    openTasks: count,
    progress: DashboardProgress,
  }),
  z.object({
    kind: z.literal('cycle'),
    project: DashboardProjectRef,
    cycle: CycleRef.pick({ number: true, name: true, startsOn: true, endsOn: true }),
    /** Days left including today: 1 on the last day. */
    daysLeft: z.number().int().positive(),
    openTasks: count,
    progress: DashboardProgress,
  }),
]);
export type DeadlineItem = z.output<typeof DeadlineItem>;

/** One queue group: the uncapped count and the first DASHBOARD_GROUP_ITEM_LIMIT items. */
export function dashboardGroup<T extends z.ZodType>(item: T) {
  return z
    .object({
      total: count,
      items: z.array(item).max(DASHBOARD_GROUP_ITEM_LIMIT),
    })
    .refine((group) => group.total >= group.items.length, {
      message: 'total counts every item, so it cannot be below the number of items',
      path: ['total'],
    });
}
export type DashboardGroup<T> = { total: number; items: T[] };

export const ReviewGroup = dashboardGroup(ReviewItem);
export const MentionGroup = dashboardGroup(MentionItem);
export const StalledGroup = dashboardGroup(StalledItem);
export const DeadlineGroup = dashboardGroup(DeadlineItem);

/** One row of the dashboard's project list. It ignores the scope switch. */
export const DashboardProject = z.object({
  key: ProjectKey,
  name: z.string(),
  openCounts: OpenStatusCounts,
  /** Sum of openCounts. */
  openCount: count,
  usesMilestones: z.boolean(),
  usesCycles: z.boolean(),
  /** Same rule as on the projects screen. Sorts the rows, newest first. */
  lastActivityAt: Timestamp,
  /** Null when the project has no current cycle or does not use cycles. total counts every task in the cycle. */
  currentCycle: CurrentCycle.pick({ number: true, name: true, endsOn: true, daysLeft: true })
    .extend({ done: count, total: count })
    .nullable(),
  /**
   * The milestone that is not Completed with the earliest target date (undated ones last). Null
   * when there is none or the project does not use milestones. total leaves canceled tasks out.
   */
  nextMilestone: MilestoneRef.pick({ id: true, name: true, targetDate: true })
    .extend({
      /** Target date before today. */
      overdue: z.boolean(),
      done: count,
      total: count,
      /** Other milestones that are not Completed. */
      others: count,
    })
    .nullable(),
});
export type DashboardProject = z.output<typeof DashboardProject>;

/** One agent in the agents strip. */
export const DashboardAgent = z.object({
  agent: AssigneeRef,
  /** Its in-progress task with the oldest last touch; null when idle. */
  currentTask: DashboardTask.nullable(),
  /** In-progress tasks, currentTask included. */
  inProgressCount: count,
  /** currentTask has had no update or comment for 24 hours. */
  stalled: z.boolean(),
  /** Newest activity row or comment by the agent in projects in scope; null when none. */
  lastActivityAt: Timestamp.nullable(),
});
export type DashboardAgent = z.output<typeof DashboardAgent>;

/** GET /dashboard: the action queue, the project rows and the agents for one scope. */
export const Dashboard = z.object({
  scope: DashboardScope,
  generatedAt: Timestamp,
  groups: z.object({
    review: ReviewGroup,
    mentions: MentionGroup,
    stalled: StalledGroup,
    deadlines: DeadlineGroup,
  }),
  /** Every project in scope, most recently active first. */
  projects: z.array(DashboardProject),
  /** Stalled first, then by name. */
  agents: z.array(DashboardAgent),
});
export type Dashboard = z.output<typeof Dashboard>;

/** GET /dashboard/counts: the Mine queue totals, for the rail. */
export const DashboardCounts = z
  .object({
    review: count,
    mentions: count,
    stalled: count,
    deadlines: count,
    /** Sum of the four groups. */
    total: count,
  })
  .refine((c) => c.total === c.review + c.mentions + c.stalled + c.deadlines, {
    message: 'total is the sum of the four groups',
    path: ['total'],
  });
export type DashboardCounts = z.output<typeof DashboardCounts>;

// ---------------------------------------------------------------------------
// List wrappers
// ---------------------------------------------------------------------------

export const ProjectList = z.object({ items: z.array(ProjectWithCounts) });
export type ProjectList = z.output<typeof ProjectList>;

export const ActivityList = z.object({ items: z.array(Activity) });
export type ActivityList = z.output<typeof ActivityList>;

export const MemberList = z.object({ items: z.array(Member) });
export type MemberList = z.output<typeof MemberList>;

export const MilestoneList = z.object({ items: z.array(MilestoneWithProgress) });
export type MilestoneList = z.output<typeof MilestoneList>;

export const CycleList = z.object({ items: z.array(Cycle) });
export type CycleList = z.output<typeof CycleList>;

export const CommentList = z.object({ items: z.array(Comment) });
export type CommentList = z.output<typeof CommentList>;

export const Timeline = z.object({ items: z.array(TimelineItem) });
export type Timeline = z.output<typeof Timeline>;

// ---------------------------------------------------------------------------
// Git connections (M3)
// ---------------------------------------------------------------------------

/** A connection as other shapes reference it. */
export const GitConnectionRef = z.object({
  id: GitConnectionId,
  name: z.string(),
  provider: GitProvider,
  host: z.string(),
  status: GitConnectionStatus,
});
export type GitConnectionRef = z.output<typeof GitConnectionRef>;

/** A project that reads through a connection; paused when its mirror is paused. */
export const GitConnectionUse = ProjectRef.extend({
  paused: z.boolean(),
});
export type GitConnectionUse = z.output<typeof GitConnectionUse>;

/** A workspace git connection. The token never leaves the server; tokenHint is its last 3 characters. */
export const GitConnection = GitConnectionRef.extend({
  /** https://api.github.com, https://host/api/v3, https://host/api/v4 or https://host/api/v1. */
  apiBaseUrl: z.string(),
  tokenHint: z.string(),
  checkedAt: Timestamp.nullable(),
  /** The login the token belongs to, from the last working check. */
  checkedLogin: z.string().nullable(),
  /** Why the last check failed, without the token. */
  checkedDetail: z.string().nullable(),
  /** Projects whose Backlog.md source uses this connection (detached ones excluded). */
  usedBy: z.array(GitConnectionUse),
  createdBy: UserRef,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type GitConnection = z.output<typeof GitConnection>;

export const GitConnectionList = z.object({
  items: z.array(GitConnection),
  /** False when APP_ENCRYPTION_KEY is not set: connections cannot be added or used. */
  encryptionReady: z.boolean(),
});
export type GitConnectionList = z.output<typeof GitConnectionList>;

/** Result of testing a token: whoami plus a repository count where the provider offers one. */
export const GitConnectionTestResult = z.object({
  status: GitConnectionStatus.exclude(['unchecked']),
  login: z.string().nullable(),
  /** Repositories the token can read; null when the provider does not say. */
  repoCount: z.number().int().nonnegative().nullable(),
  /** Short reason for rejected or unreachable, without the token. */
  detail: z.string().nullable(),
  checkedAt: Timestamp,
});
export type GitConnectionTestResult = z.output<typeof GitConnectionTestResult>;

/** Result of deleting a connection: the projects whose mirrors paused. */
export const GitConnectionDeleted = z.object({
  id: GitConnectionId,
  pausedProjects: z.array(ProjectRef),
});
export type GitConnectionDeleted = z.output<typeof GitConnectionDeleted>;

// ---------------------------------------------------------------------------
// Backlog.md sources (M3)
// ---------------------------------------------------------------------------

/** How a mapping row was decided: prefilled by name, fallen back, or chosen by a person. */
export const MAPPING_HOWS = ['name', 'fallback', 'manual'] as const;
export const MappingHow = z.enum(MAPPING_HOWS);
export type MappingHow = z.infer<typeof MappingHow>;

/** A Backlog.md value as written in the files ("In Progress", "high", "@claude"). */
export const BacklogValue = z.string().trim().min(1, 'Value is required').max(200);

export const StatusMapping = z.object({ from: BacklogValue, to: TaskStatus, how: MappingHow });
export type StatusMapping = z.output<typeof StatusMapping>;

export const PriorityMapping = z.object({ from: BacklogValue, to: Priority, how: MappingHow });
export type PriorityMapping = z.output<typeof PriorityMapping>;

/** userId null: no one (the task stays unassigned and keeps the value in its Backlog.md block). */
export const AssigneeMapping = z.object({ from: BacklogValue, userId: UserId.nullable(), how: MappingHow });
export type AssigneeMapping = z.output<typeof AssigneeMapping>;

/** Longest mapping list per kind. */
export const MAX_MAPPING_ROWS = 500;

/** No two rows of one kind may map the same value (compared ignoring case). */
function uniqueFrom(rows: { from: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.from.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: [index, 'from'], message: `"${row.from}" is mapped twice` });
    }
    seen.add(key);
  });
}

/**
 * backlog_source.mappings and the mappings every setup and settings input carries. Values seen
 * later without a row get the fallback (status Todo, priority none, no assignee) and a warning.
 */
export const BacklogMappings = z.object({
  status: z.array(StatusMapping).max(MAX_MAPPING_ROWS).superRefine(uniqueFrom),
  priority: z.array(PriorityMapping).max(MAX_MAPPING_ROWS).superRefine(uniqueFrom),
  assignee: z.array(AssigneeMapping).max(MAX_MAPPING_ROWS).superRefine(uniqueFrom),
});
export type BacklogMappings = z.output<typeof BacklogMappings>;

/** Mapping rows as shown: with the number of tasks using the value, and assignees resolved. */
export const BacklogMappingsView = z.object({
  status: z.array(StatusMapping.extend({ count: z.number().int().nonnegative() })),
  priority: z.array(PriorityMapping.extend({ count: z.number().int().nonnegative() })),
  assignee: z.array(
    AssigneeMapping.extend({ count: z.number().int().nonnegative(), user: UserRef.nullable() }),
  ),
});
export type BacklogMappingsView = z.output<typeof BacklogMappingsView>;

/** The parts of config.yml the app uses, as stored in backlog_source.config. */
export const BacklogConfigSummary = z.object({
  projectName: z.string().nullable(),
  /** Uppercase task_prefix: BACK (Backlog.md's default is TASK). */
  taskPrefix: z.string(),
  statuses: z.array(z.string()),
  defaultStatus: z.string().nullable(),
  priorities: z.array(z.string()),
  labels: z.array(z.string()),
  /** Legacy `milestones:` list in config.yml. */
  milestones: z.array(z.string()),
  zeroPaddedIds: z.number().int().nonnegative().nullable(),
});
export type BacklogConfigSummary = z.output<typeof BacklogConfigSummary>;

/** Fields whose values go through a mapping or a lookup, and can fall back. */
export const BACKLOG_VALUE_FIELDS = ['status', 'priority', 'assignee', 'milestone'] as const;
export const BacklogValueField = z.enum(BACKLOG_VALUE_FIELDS);
export type BacklogValueField = z.infer<typeof BacklogValueField>;

/**
 * One problem of the last read (or of a preview).
 * file: a file skipped (`skipped`, its task keeps the last good version) or read with a warning
 * (an unreadable date, a missing parent, a duplicate id), e.g. "dependencies must be a flat list (line 9)".
 * value: a value without a mapping or match, and what it fell back to.
 */
export const BacklogProblem = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    path: z.string(),
    backlogId: z.string().nullable(),
    skipped: z.boolean(),
    message: z.string(),
  }),
  z.object({
    kind: z.literal('value'),
    field: BacklogValueField,
    value: z.string(),
    /** Tasks that carry the value. */
    count: z.number().int().nonnegative(),
    /** Label of what the tasks got instead ("Todo", "No one"); null when the value is just dropped. */
    fallback: z.string().nullable(),
    message: z.string(),
  }),
]);
export type BacklogProblem = z.output<typeof BacklogProblem>;

/** One page of problems, files first (by path), then values. */
export const BacklogProblemPage = z.object({
  items: z.array(BacklogProblem),
  nextCursor: z.string().nullable(),
  counts: BacklogProblemCounts,
});
export type BacklogProblemPage = z.output<typeof BacklogProblemPage>;

/** Content counts of a source (visible tasks unless named otherwise). */
export const BacklogCounts = z.object({
  tasks: z.number().int().nonnegative(),
  /** Tasks in an open status. */
  open: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  subtasks: z.number().int().nonnegative(),
  milestones: z.number().int().nonnegative(),
  hidden: z.number().int().nonnegative(),
});
export type BacklogCounts = z.output<typeof BacklogCounts>;

/** The last successful read. */
export const BacklogRead = z.object({
  at: Timestamp,
  trigger: BacklogTrigger.nullable(),
  commit: z.string(),
  /** Web page of the commit on the provider; null when unknown. */
  commitUrl: z.string().nullable().default(null),
  /** First line of the commit message, when the provider gave it. */
  commitTitle: z.string().nullable().default(null),
});
export type BacklogRead = z.output<typeof BacklogRead>;

/** GET /projects/{key}/backlog, the settings page and pm backlog status. */
export const BacklogSourceStatus = z.object({
  id: BacklogSourceId,
  project: ProjectRef,
  mode: BacklogMode,
  state: BacklogState,
  /** The project's repository as entered; null when it was cleared (the mirror pauses). */
  repository: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  /** The folder the last read used (backlog, .backlog, ...). */
  folder: z.string().nullable(),
  /** The folder chosen by hand; null: detected. */
  folderOverride: z.string().nullable(),
  /** Uppercase task_prefix: BACK. */
  prefix: z.string().nullable(),
  /** Null once the connection was deleted. */
  connection: GitConnectionRef.nullable(),
  /** Head of the default branch at the last attempt. */
  headCommit: z.string().nullable(),
  lastRead: BacklogRead.nullable(),
  lastAttemptAt: Timestamp.nullable(),
  lastTrigger: BacklogTrigger.nullable(),
  /** Why the last refresh failed or the source paused. */
  lastError: z.string().nullable(),
  /** The next hourly check; null when paused or detached. */
  nextPollAt: Timestamp.nullable(),
  /** When the last accepted webhook delivery arrived; null: never. */
  webhookLastAt: Timestamp.nullable(),
  counts: BacklogCounts,
  problems: BacklogProblemPage,
  mappings: BacklogMappingsView,
  config: BacklogConfigSummary.nullable(),
  createdBy: UserRef,
  createdAt: Timestamp,
  detachedAt: Timestamp.nullable(),
  detachedBy: UserRef.nullable(),
  /** Project-level entries, oldest first. */
  history: z.array(ProjectActivity),
  /** The key the next task created in the app gets (after detach): PAY-813. */
  nextTaskKey: z.string().optional(),
});
export type BacklogSourceStatus = z.output<typeof BacklogSourceStatus>;

/** POST /projects/{key}/backlog/refresh (202). queued is false when a run was already waiting. */
export const BacklogRefreshResult = z.object({
  project: ProjectKey,
  state: BacklogState,
  queued: z.boolean(),
  lastAttemptAt: Timestamp.nullable(),
});
export type BacklogRefreshResult = z.output<typeof BacklogRefreshResult>;

/** How the folder was found: by hand, backlog_directory in backlog.config.yml, or the defaults. */
export const BACKLOG_FOLDER_SOURCES = ['override', 'config', 'default'] as const;
export const BacklogFolderSource = z.enum(BACKLOG_FOLDER_SOURCES);
export type BacklogFolderSource = z.infer<typeof BacklogFolderSource>;

/** Whether the connection can read the repository. */
export const BACKLOG_ACCESS = ['ok', 'no_access', 'not_found', 'unreachable'] as const;
export const BacklogAccess = z.enum(BACKLOG_ACCESS);
export type BacklogAccess = z.infer<typeof BacklogAccess>;

/** One subfolder of the Backlog.md folder and its file count; docs/ and decisions/ are ignored. */
export const BacklogFolderCount = z.object({
  /** Relative to the Backlog.md folder, with a trailing slash: tasks/, archive/tasks/. */
  path: z.string(),
  count: z.number().int().nonnegative(),
  ignored: z.boolean(),
});
export type BacklogFolderCount = z.output<typeof BacklogFolderCount>;

/** Setup step 2 (source): what the connection sees in the project's repository. Nothing is written. */
export const BacklogDetection = z.object({
  repository: z.string(),
  access: BacklogAccess,
  defaultBranch: z.string().nullable(),
  headCommit: z.string().nullable(),
  headCommittedAt: Timestamp.nullable().default(null),
  /** Null when no Backlog.md folder was found. */
  folder: z.string().nullable(),
  folderSource: BacklogFolderSource.nullable(),
  config: BacklogConfigSummary.nullable(),
  /** Why config.yml could not be read; the setup cannot continue then. */
  configError: z.string().nullable(),
  folders: z.array(BacklogFolderCount),
  /** True when the project key equals the task prefix (BACK-786 stays BACK-786). */
  keyMatchesPrefix: z.boolean(),
  /** Mappings prefilled by name from every value in the files (setup step 3). */
  mappings: BacklogMappingsView,
});
export type BacklogDetection = z.output<typeof BacklogDetection>;

/** A sample row of the preview: BACK-786 → PAY-786. */
export const BacklogPreviewRow = z.object({
  backlogId: z.string(),
  key: TaskKey,
  title: z.string(),
  status: TaskStatus,
  kind: BacklogTaskKind,
});
export type BacklogPreviewRow = z.output<typeof BacklogPreviewRow>;

/** Setup step 4: a dry run of the refresh on the current head. Nothing is written. */
export const BacklogPreview = z.object({
  commit: z.string(),
  defaultBranch: z.string(),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    archived: z.number().int().nonnegative(),
    /** Archived tasks found in the legacy completed/ folder (included in archived). */
    completed: z.number().int().nonnegative(),
    subtasks: z.number().int().nonnegative(),
    milestones: z.number().int().nonnegative(),
    archivedMilestones: z.number().int().nonnegative(),
  }),
  /** The first rows in Backlog.md order. */
  sample: z.array(BacklogPreviewRow),
  /** Files that would be skipped or read with a warning. */
  files: z.array(BacklogProblem),
  /** Values that would fall back. */
  fallbacks: z.array(BacklogProblem),
});
export type BacklogPreview = z.output<typeof BacklogPreview>;

export const BACKLOG_WEBHOOK_SECRET_STATES = ['ok', 'unreadable', 'hidden'] as const;
/**
 * Whether the webhook secret could be shown: ok (it is in `secret`), unreadable (the stored secret
 * can't be decrypted with the current APP_ENCRYPTION_KEY; issue a new one), hidden (the actor can't
 * manage the source, or it has no secret after detach).
 */
export const BacklogWebhookSecretState = z.enum(BACKLOG_WEBHOOK_SECRET_STATES);
export type BacklogWebhookSecretState = z.infer<typeof BacklogWebhookSecretState>;

const BacklogWebhookInfoShape = z.object({
  url: z.url(),
  secret: z.string().nullable(),
  /** 0.6.0. */
  secretState: BacklogWebhookSecretState,
  provider: GitProvider.nullable(),
  lastAt: Timestamp.nullable(),
});

/**
 * Webhook settings of a source. The secret is present only for backlog.manage (owners and admins).
 * Servers send secretState; when one leaves it out it follows `secret` (a string is ok, null is
 * hidden), so shapes built before the field existed stay valid. Unreadable is never inferred.
 */
export const BacklogWebhookInfo = BacklogWebhookInfoShape.extend({
  secretState: BacklogWebhookSecretState.optional(),
})
  .transform(
    (info): z.input<typeof BacklogWebhookInfoShape> => ({
      ...info,
      secretState: info.secretState ?? (info.secret === null ? 'hidden' : 'ok'),
    }),
  )
  .pipe(BacklogWebhookInfoShape);
export type BacklogWebhookInfo = z.output<typeof BacklogWebhookInfo>;

/** A newly issued webhook secret, shown once. The URL is unchanged. */
export const BacklogWebhookSecret = z.object({
  url: z.url(),
  secret: z.string().min(1),
});
export type BacklogWebhookSecret = z.output<typeof BacklogWebhookSecret>;
