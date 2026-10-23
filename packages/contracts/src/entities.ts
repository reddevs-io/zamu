import { z } from 'zod';
import {
  ApiKeyAccess,
  AuthId,
  CalendarDate,
  CommentId,
  CycleId,
  CycleState,
  MilestoneId,
  MilestoneStatus,
  Priority,
  ProjectId,
  ProjectKey,
  RowId,
  TaskKey,
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
  milestone: MilestoneRef.nullable().default(null),
  cycle: CycleRef.nullable().default(null),
  /** When the task last entered its cycle; after the cycle's start means "added after start". */
  cycleAddedAt: Timestamp.nullable().default(null),
  /** Position inside its status column on the board, ascending. Only the order matters. */
  rank: z.number(),
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

export const ACTIVITY_TYPES = ['task.created', 'task.updated', 'cycle.ended'] as const;
export const ActivityType = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityType>;

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
  createdAt: Timestamp,
});
export type Activity = z.output<typeof Activity>;

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
