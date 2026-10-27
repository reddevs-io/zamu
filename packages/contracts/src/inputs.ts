import { z } from 'zod';
import { ApiKeyScope, BacklogMappings, DashboardScope, MAX_COMMENT_LENGTH } from './entities';
import {
  AuthId,
  BacklogMode,
  CalendarDate,
  CommentId,
  CycleNumber,
  CycleSelector,
  CycleState,
  cycleLengthDays,
  GitConnectionId,
  GitProvider,
  MAX_CYCLE_DAYS,
  MilestoneId,
  MilestoneStatus,
  Priority,
  ProjectKeyInput,
  TaskKeyInput,
  TaskRefInput,
  TaskStatus,
  Theme,
  UserId,
} from './primitives';
import { MAX_REPOSITORY_URL_LENGTH, parseRepositoryUrl, REPOSITORY_URL_HINT } from './repository';

// Input schemas. Every entry point (API, server functions, CLI) parses with these.
// Use z.input<> for what a caller may send and z.output<> (the exported types) for the parsed value.

/** Accepts one value or a list, always yields a de-duplicated list. Query strings carry either form. */
function oneOrMany<T extends z.ZodType<string>>(item: T) {
  return z
    .union([z.array(item).min(1), item])
    .transform((value): z.output<T>[] => [...new Set(Array.isArray(value) ? value : [value])]);
}

/** At least one of the listed fields must be present. */
function requireOneOf<K extends string>(fields: readonly K[]) {
  return (value: Partial<Record<K, unknown>>) => fields.some((field) => value[field] !== undefined);
}

// ---------------------------------------------------------------------------
// Shared fields
// ---------------------------------------------------------------------------

export const ProjectName = z.string().trim().min(1, 'Name is required').max(100);
export const ProjectDescription = z.string().trim().max(2_000);
/** A clone URL (HTTPS or SSH), or '' for none. */
export const ProjectRepository = z
  .string()
  .trim()
  .max(MAX_REPOSITORY_URL_LENGTH)
  .refine((value) => value === '' || parseRepositoryUrl(value) !== null, REPOSITORY_URL_HINT);
export const TaskTitle = z.string().trim().min(1, 'Title is required').max(300);
/** Markdown. Not trimmed: leading indentation can be meaningful. */
export const TaskDescription = z.string().max(100_000);

/** `me` assigns the caller. Any other value is a user id. */
export const ASSIGNEE_ME = 'me';
export const AssigneeInput = z.union([z.literal(ASSIGNEE_ME), UserId]);

/** Task list assignee filter: the caller, any agent, or one user id. */
export const ASSIGNEE_AGENTS = 'agents';
export const AssigneeFilter = z.union([z.literal(ASSIGNEE_ME), z.literal(ASSIGNEE_AGENTS), UserId]);

/** Filter value for tasks without a milestone or without a cycle. */
export const FILTER_NONE = 'none';

/** Task list milestone filter: one milestone id, or `none` for tasks without one. */
export const MilestoneFilter = z.union([z.literal(FILTER_NONE), MilestoneId]);

/** Task list cycle filter: a cycle number, `current`, `next`, or `none` for tasks without one. */
export const CycleFilter = z.union([z.literal(FILTER_NONE), CycleSelector], {
  error: 'Use a cycle number, current, next or none',
});

/** Sets a task's cycle: a number, `current` or `next`. Completed cycles are rejected by core. */
export const CycleInput = CycleSelector;

/**
 * Board position inside the target status column: right before or right after another task of
 * that column. Exactly one of the two.
 */
export const TaskPosition = z.union(
  [z.strictObject({ before: TaskKeyInput }), z.strictObject({ after: TaskKeyInput })],
  { error: 'Give exactly one of before or after' },
);
export type TaskPosition = z.output<typeof TaskPosition>;

/**
 * M3: tasks whose Backlog.md file is gone are hidden. Lists leave them out unless asked: `only`
 * lists just them, `include` lists them with the rest.
 */
export const HIDDEN_FILTERS = ['only', 'include'] as const;
export const HiddenFilter = z.enum(HIDDEN_FILTERS);
export type HiddenFilter = z.infer<typeof HiddenFilter>;

export const TASK_LIST_ORDERS = ['list', 'board'] as const;
/** list: status, priority desc, updated desc (M1). board: status, then rank. */
export const TaskListOrder = z.enum(TASK_LIST_ORDERS);
export type TaskListOrder = z.infer<typeof TaskListOrder>;

export const DEFAULT_TASK_STATUS = 'todo' satisfies TaskStatus;
export const DEFAULT_TASK_PRIORITY = 'none' satisfies Priority;
export const DEFAULT_TASK_LIST_LIMIT = 50;
export const MAX_TASK_LIST_LIMIT = 200;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const CreateProjectInput = z.object({
  name: ProjectName,
  key: ProjectKeyInput,
  description: ProjectDescription.optional(),
  /** Links the project to a git repository; '' or omitted for none. */
  repository: ProjectRepository.optional(),
});
export type CreateProjectInput = z.output<typeof CreateProjectInput>;

/** `project` is the current key (path parameter); `key` renames it while the project has no tasks. */
export const UpdateProjectInput = z
  .object({
    project: ProjectKeyInput,
    key: ProjectKeyInput.optional(),
    name: ProjectName.optional(),
    /** null clears the description. */
    description: ProjectDescription.nullable().optional(),
    usesMilestones: z.boolean().optional(),
    usesCycles: z.boolean().optional(),
    /** null or '' unlinks the repository. */
    repository: ProjectRepository.nullable().optional(),
  })
  .refine(requireOneOf(['key', 'name', 'description', 'usesMilestones', 'usesCycles', 'repository']), {
    message: 'Change at least one of key, name, description, usesMilestones, usesCycles or repository',
  });
export type UpdateProjectInput = z.output<typeof UpdateProjectInput>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const ListTasksInput = z.object({
  /** One or more project keys. Omitted: every project the caller can read in the workspace. */
  project: oneOrMany(ProjectKeyInput).optional(),
  status: oneOrMany(TaskStatus).optional(),
  priority: oneOrMany(Priority).optional(),
  assignee: AssigneeFilter.optional(),
  milestone: MilestoneFilter.optional(),
  /** current and next resolve per project. */
  cycle: CycleFilter.optional(),
  /** Matches the title, the task key or the Backlog.md id. */
  q: z.string().trim().max(200).optional(),
  /** Omitted: hidden tasks are left out. */
  hidden: HiddenFilter.optional(),
  order: TaskListOrder.default('list'),
  /** Only valid with the same order and filters it came from. */
  cursor: z.string().min(1).max(512).optional(),
  /** Query strings carry numbers as text, so this coerces. */
  limit: z.coerce.number<number>().int().min(1).max(MAX_TASK_LIST_LIMIT).default(DEFAULT_TASK_LIST_LIMIT),
});
export type ListTasksInput = z.output<typeof ListTasksInput>;

/**
 * Narrows a Backlog.md id lookup to one project. Ids like TASK-12 repeat across repositories, so
 * the CLI passes the project it resolved; app keys name their project already.
 */
const TaskRefProject = ProjectKeyInput.optional();

/** `key` is an app key (PAY-786.1) or a Backlog.md id (BACK-786.1); see TaskRefInput. */
export const GetTaskInput = z.object({
  key: TaskRefInput,
  project: TaskRefProject,
});
export type GetTaskInput = z.output<typeof GetTaskInput>;

export const ListTaskActivityInput = GetTaskInput;
export type ListTaskActivityInput = GetTaskInput;

export const ListTaskTimelineInput = GetTaskInput;
export type ListTaskTimelineInput = GetTaskInput;

export const CreateTaskInput = z.object({
  project: ProjectKeyInput,
  title: TaskTitle,
  description: TaskDescription.optional(),
  status: TaskStatus.default(DEFAULT_TASK_STATUS),
  priority: Priority.default(DEFAULT_TASK_PRIORITY),
  /** Omitted or null leaves the task unassigned. */
  assignee: AssigneeInput.nullable().optional(),
  /** A milestone of the same project. Omitted or null: none. */
  milestone: MilestoneId.nullable().optional(),
  /** A cycle of the same project. Omitted or null: none. */
  cycle: CycleInput.nullable().optional(),
});
export type CreateTaskInput = z.output<typeof CreateTaskInput>;

export const UpdateTaskInput = z
  .object({
    key: TaskRefInput,
    project: TaskRefProject,
    title: TaskTitle.optional(),
    /** null clears the description. */
    description: TaskDescription.nullable().optional(),
    status: TaskStatus.optional(),
    priority: Priority.optional(),
    /** null clears the assignee. */
    assignee: AssigneeInput.nullable().optional(),
    /** null clears the milestone. */
    milestone: MilestoneId.nullable().optional(),
    /** null clears the cycle. */
    cycle: CycleInput.nullable().optional(),
    /** Board placement in the target status column (the new status when `status` is set). */
    position: TaskPosition.optional(),
    /**
     * The updatedAt the caller last saw. When the stored task is newer, the update fails with
     * TASK_CHANGED (409) and the current task. Compared at millisecond precision.
     */
    ifUpdatedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString())
      .optional(),
  })
  .refine(
    requireOneOf([
      'title',
      'description',
      'status',
      'priority',
      'assignee',
      'milestone',
      'cycle',
      'position',
    ]),
    {
      message:
        'Change at least one of title, description, status, priority, assignee, milestone, cycle or position',
    },
  );
export type UpdateTaskInput = z.output<typeof UpdateTaskInput>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const DEFAULT_DASHBOARD_SCOPE = 'mine' satisfies DashboardScope;

/**
 * GET /dashboard?scope=mine|everyone. DashboardScope lives in entities because Dashboard echoes it.
 * The whole input may be omitted: a bare GET reads the default scope.
 */
export const GetDashboardInput = z
  .object({
    scope: DashboardScope.default(DEFAULT_DASHBOARD_SCOPE),
  })
  .prefault({});
export type GetDashboardInput = z.output<typeof GetDashboardInput>;

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

/** PATCH /me. Sessions only: API keys get 403. */
export const UpdateMeInput = z.object({
  theme: Theme,
});
export type UpdateMeInput = z.output<typeof UpdateMeInput>;

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Markdown, 1 to 20,000 characters after trimming. Mentions are [@Name](mention:<userId>); API
 * callers may also write @agent-name or @email, which core rewrites to that form.
 */
export const CommentBody = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(MAX_COMMENT_LENGTH, `Keep comments under ${MAX_COMMENT_LENGTH.toLocaleString('en-US')} characters`);

export const ListCommentsInput = GetTaskInput;
export type ListCommentsInput = GetTaskInput;

export const CreateCommentInput = z.object({
  key: TaskRefInput,
  project: TaskRefProject,
  body: CommentBody,
});
export type CreateCommentInput = z.output<typeof CreateCommentInput>;

export const UpdateCommentInput = z.object({
  id: CommentId,
  body: CommentBody,
});
export type UpdateCommentInput = z.output<typeof UpdateCommentInput>;

export const DeleteCommentInput = z.object({
  id: CommentId,
});
export type DeleteCommentInput = z.output<typeof DeleteCommentInput>;

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** Unique per project, ignoring case, so the CLI can address milestones by name. */
export const MilestoneName = z.string().trim().min(1, 'Name is required').max(100);
/** Markdown. */
export const MilestoneDescription = z.string().max(10_000);

export const ListMilestonesInput = z.object({
  project: ProjectKeyInput,
  status: oneOrMany(MilestoneStatus).optional(),
});
export type ListMilestonesInput = z.output<typeof ListMilestonesInput>;

export const GetMilestoneInput = z.object({
  id: MilestoneId,
});
export type GetMilestoneInput = z.output<typeof GetMilestoneInput>;

export const CreateMilestoneInput = z.object({
  project: ProjectKeyInput,
  name: MilestoneName,
  description: MilestoneDescription.nullable().optional(),
  targetDate: CalendarDate.nullable().optional(),
});
export type CreateMilestoneInput = z.output<typeof CreateMilestoneInput>;

export const UpdateMilestoneInput = z
  .object({
    id: MilestoneId,
    name: MilestoneName.optional(),
    /** null clears the description. */
    description: MilestoneDescription.nullable().optional(),
    /** null clears the target date. */
    targetDate: CalendarDate.nullable().optional(),
    /** completed marks it done by hand; leaving completed sets active. */
    status: MilestoneStatus.optional(),
  })
  .refine(requireOneOf(['name', 'description', 'targetDate', 'status']), {
    message: 'Change at least one of name, description, targetDate or status',
  });
export type UpdateMilestoneInput = z.output<typeof UpdateMilestoneInput>;

export const DeleteMilestoneInput = GetMilestoneInput;
export type DeleteMilestoneInput = GetMilestoneInput;

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

export const CycleName = z.string().trim().min(1, 'Name is required').max(100);

/** Adds the date rules when both dates are present: order and length 1 to 56 days. */
function checkCycleDates(value: { startsOn?: string; endsOn?: string }, ctx: z.RefinementCtx) {
  if (!value.startsOn || !value.endsOn) return;
  const days = cycleLengthDays(value.startsOn, value.endsOn);
  if (days < 1) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'End on or after the start date' });
  else if (days > MAX_CYCLE_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: `Keep cycles to ${MAX_CYCLE_DAYS} days or fewer`,
    });
  }
}

export const ListCyclesInput = z.object({
  project: ProjectKeyInput,
  state: oneOrMany(CycleState).optional(),
});
export type ListCyclesInput = z.output<typeof ListCyclesInput>;

/** Addresses one cycle: /cycles/{project}/{number}. `number` also takes current or next. */
export const GetCycleInput = z.object({
  project: ProjectKeyInput,
  number: CycleSelector,
});
export type GetCycleInput = z.output<typeof GetCycleInput>;

/**
 * Omitted dates default from the last cycle: start the day after it ends, same length. The first
 * cycle starts next Monday and lasts 14 days. Cycles never overlap.
 */
export const CreateCycleInput = z
  .object({
    project: ProjectKeyInput,
    name: CycleName.nullable().optional(),
    startsOn: CalendarDate.optional(),
    endsOn: CalendarDate.optional(),
  })
  .superRefine(checkCycleDates);
export type CreateCycleInput = z.output<typeof CreateCycleInput>;

/** Dates change only while the cycle is Upcoming; the name any time before it ends. */
export const UpdateCycleInput = z
  .object({
    project: ProjectKeyInput,
    number: CycleSelector,
    /** null clears the name. */
    name: CycleName.nullable().optional(),
    startsOn: CalendarDate.optional(),
    endsOn: CalendarDate.optional(),
  })
  .refine(requireOneOf(['name', 'startsOn', 'endsOn']), {
    message: 'Change at least one of name, startsOn or endsOn',
  })
  .superRefine(checkCycleDates);
export type UpdateCycleInput = z.output<typeof UpdateCycleInput>;

export const MOVE_TO_NONE = 'none';

/**
 * Ends a cycle now. Unfinished tasks move to `moveTo`: a cycle number, or `none` to clear their
 * cycle. Omitted: the next upcoming cycle, or a new one of the same length.
 */
export const EndCycleInput = z.object({
  project: ProjectKeyInput,
  number: CycleSelector,
  moveTo: z.union([z.literal(MOVE_TO_NONE), CycleNumber], { error: 'Use a cycle number or none' }).optional(),
});
export type EndCycleInput = z.output<typeof EndCycleInput>;

// ---------------------------------------------------------------------------
// Settings (server functions in the web app, not /api/v1)
// ---------------------------------------------------------------------------

export const AGENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Agent names show in activity next to every change, so they are short slugs like `docs-bot`. */
export const AgentName = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(AGENT_NAME_PATTERN, 'Use lowercase letters, numbers and dashes');

export const ApiKeyName = z.string().trim().min(1, 'Name is required').max(100);

export const CreateAgentInput = z.object({
  name: AgentName,
  responsibleUserId: UserId,
  /** Scope of the agent's first API key. */
  scope: ApiKeyScope,
  /** Name of the first API key; core picks one from the agent name when omitted. */
  keyName: ApiKeyName.optional(),
});
export type CreateAgentInput = z.output<typeof CreateAgentInput>;

export const CreateApiKeyInput = z.object({
  name: ApiKeyName,
  /** Defaults to the caller. Another user id only for an agent the caller is responsible for, or by admins. */
  ownerId: UserId.optional(),
  scope: ApiKeyScope,
});
export type CreateApiKeyInput = z.output<typeof CreateApiKeyInput>;

export const RevokeApiKeyInput = z.object({
  id: AuthId,
});
export type RevokeApiKeyInput = z.output<typeof RevokeApiKeyInput>;

export const InvitationRole = z.enum(['member', 'admin']);
export type InvitationRole = z.infer<typeof InvitationRole>;

export const CreateInvitationInput = z.object({
  email: z.email(),
  role: InvitationRole.default('member'),
});
export type CreateInvitationInput = z.output<typeof CreateInvitationInput>;

export const CancelInvitationInput = z.object({ id: AuthId });
export type CancelInvitationInput = z.output<typeof CancelInvitationInput>;

export const RemoveMemberInput = z.object({ userId: UserId });
export type RemoveMemberInput = z.output<typeof RemoveMemberInput>;

/** Which keys to list: every key in the workspace (admins), your own, or one member's. */
export const ListApiKeysInput = z.object({
  owner: z.union([z.literal('all'), z.literal('me'), UserId]).default('me'),
});
export type ListApiKeysInput = z.output<typeof ListApiKeysInput>;

// ---------------------------------------------------------------------------
// Sign-in, first-run setup and invitation accept (web forms and server functions)
// ---------------------------------------------------------------------------

/**
 * Same value as MIN_PASSWORD_LENGTH in @pm/auth, which Better Auth enforces. @pm/auth does not
 * depend on this package, so a web test keeps the two equal.
 */
export const MIN_PASSWORD_LENGTH = 12;
/** Better Auth's default maximum password length. */
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_PERSON_NAME_LENGTH = 100;
export const MAX_WORKSPACE_NAME_LENGTH = 64;

/** Field messages of the sign-in, setup and invitation forms. */
export const AUTH_FIELD_MESSAGES = {
  name: 'Enter your name.',
  nameTooLong: `Use ${MAX_PERSON_NAME_LENGTH} characters or fewer.`,
  email: 'Enter a valid email address.',
  password: 'Enter your password.',
  newPassword: `Use ${MIN_PASSWORD_LENGTH} characters or more.`,
  passwordTooLong: `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`,
  workspaceName: 'Enter a workspace name.',
  workspaceNameTooLong: `Use ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
} as const;

const PersonName = z
  .string()
  .trim()
  .min(1, AUTH_FIELD_MESSAGES.name)
  .max(MAX_PERSON_NAME_LENGTH, AUTH_FIELD_MESSAGES.nameTooLong);
const SignInEmail = z.string().trim().pipe(z.email(AUTH_FIELD_MESSAGES.email));
const NewPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, AUTH_FIELD_MESSAGES.newPassword)
  .max(MAX_PASSWORD_LENGTH, AUTH_FIELD_MESSAGES.passwordTooLong);

export const SignInFields = z.object({
  email: SignInEmail,
  password: z.string().min(1, AUTH_FIELD_MESSAGES.password),
});
export type SignInFields = z.input<typeof SignInFields>;

export const AccountFields = z.object({ name: PersonName, email: SignInEmail, password: NewPassword });
export type AccountFields = z.input<typeof AccountFields>;

export const WorkspaceFields = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, AUTH_FIELD_MESSAGES.workspaceName)
    .max(MAX_WORKSPACE_NAME_LENGTH, AUTH_FIELD_MESSAGES.workspaceNameTooLong),
});
export type WorkspaceFields = z.input<typeof WorkspaceFields>;

/** Input of the setup server function: both steps of the first-run form. */
export const SetupInput = AccountFields.extend(WorkspaceFields.shape);
export type SetupInput = z.output<typeof SetupInput>;

export const InviteFields = z.object({ name: PersonName, password: NewPassword });
export type InviteFields = z.input<typeof InviteFields>;

/** Input of the invitation accept server function. The email always comes from the invitation. */
export const AcceptInvitationInput = InviteFields.extend({ invitationId: z.uuid() });
export type AcceptInvitationInput = z.output<typeof AcceptInvitationInput>;

// ---------------------------------------------------------------------------
// Git connections (M3, server functions)
// ---------------------------------------------------------------------------

/** Unique per workspace ignoring case. */
export const GitConnectionName = z.string().trim().min(1, 'Name is required').max(100);

const HOST_PATTERN =
  /^(?=.{1,253}(?::|$))[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::[1-9][0-9]{0,4})?$/;
const HOST_MESSAGE = 'Use a host like gitlab.com or git.example.com:3000, without a path';

/**
 * A git host: lowercase name with an optional port, no scheme or path. A pasted
 * `https://GitLab.example.com/` becomes `gitlab.example.com`.
 */
export const GitHost = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, ''))
  .pipe(z.string().max(260).regex(HOST_PATTERN, HOST_MESSAGE));

/** An access token as pasted. Read-only scopes are enough. Never echoed back. */
export const GitToken = z
  .string()
  .trim()
  .min(1, 'Paste the access token')
  .max(4_096)
  .regex(/^\S+$/, 'The token has spaces in it; paste it again');

export const CreateGitConnectionInput = z.object({
  provider: GitProvider,
  host: GitHost,
  name: GitConnectionName,
  token: GitToken,
});
export type CreateGitConnectionInput = z.output<typeof CreateGitConnectionInput>;

/** A new token replaces the stored one; provider and host stay (delete and re-add to change them). */
export const UpdateGitConnectionInput = z
  .object({
    id: GitConnectionId,
    name: GitConnectionName.optional(),
    token: GitToken.optional(),
  })
  .refine(requireOneOf(['name', 'token']), { message: 'Change at least one of name or token' });
export type UpdateGitConnectionInput = z.output<typeof UpdateGitConnectionInput>;

export const DeleteGitConnectionInput = z.object({
  id: GitConnectionId,
});
export type DeleteGitConnectionInput = z.output<typeof DeleteGitConnectionInput>;

/**
 * Tests a token without saving it (the add dialog), a saved connection, or a saved connection with
 * a replacement token (the edit dialog). Testing a saved connection stores the result.
 */
export const TestGitConnectionInput = z.union(
  [
    z.strictObject({ provider: GitProvider, host: GitHost, token: GitToken }),
    z.strictObject({ id: GitConnectionId, token: GitToken.optional() }),
  ],
  { error: 'Give a saved connection id, or a provider, host and token' },
);
export type TestGitConnectionInput = z.output<typeof TestGitConnectionInput>;

// ---------------------------------------------------------------------------
// Backlog.md (M3): /api/v1 routes
// ---------------------------------------------------------------------------

export const DEFAULT_BACKLOG_PROBLEM_LIMIT = 50;
export const MAX_BACKLOG_PROBLEM_LIMIT = 200;

/** GET /projects/{project}/backlog. The problem list is paged. */
export const GetBacklogStatusInput = z.object({
  project: ProjectKeyInput,
  /** From a previous page's problems.nextCursor. */
  problemsCursor: z.string().min(1).max(512).optional(),
  problemsLimit: z.coerce
    .number<number>()
    .int()
    .min(1)
    .max(MAX_BACKLOG_PROBLEM_LIMIT)
    .default(DEFAULT_BACKLOG_PROBLEM_LIMIT),
});
export type GetBacklogStatusInput = z.output<typeof GetBacklogStatusInput>;

/** POST /projects/{project}/backlog/refresh: trigger cli. */
export const RefreshBacklogInput = z.object({
  project: ProjectKeyInput,
});
export type RefreshBacklogInput = z.output<typeof RefreshBacklogInput>;

// ---------------------------------------------------------------------------
// Backlog.md (M3): setup and settings server functions
// ---------------------------------------------------------------------------

/**
 * A Backlog.md folder relative to the repository root: backlog, .backlog, docs/backlog. Leading
 * `./` and trailing slashes are dropped.
 */
export const BacklogFolder = z
  .string()
  .trim()
  .transform((value) => value.replace(/^(?:\.\/)+/, '').replace(/\/+$/, ''))
  .pipe(
    z
      .string()
      .min(1, 'Name a folder, e.g. backlog')
      .max(200)
      .refine((value) => !value.startsWith('/'), 'Use a path inside the repository, without a leading /')
      .refine((value) => !value.includes('\\'), 'Use / between folders')
      .refine(
        (value) => value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
        'Use a plain folder path without . or .. parts',
      ),
  );

const BacklogProjectKey = ProjectKeyInput;

/** Setup step 2: what the connection sees in the project's repository. */
export const DetectBacklogInput = z.object({
  projectKey: BacklogProjectKey,
  connectionId: GitConnectionId,
  /** Omitted: backlog_directory from backlog.config.yml, else backlog/, else .backlog/. */
  folderOverride: BacklogFolder.optional(),
});
export type DetectBacklogInput = z.output<typeof DetectBacklogInput>;

/**
 * New project from Backlog.md: what the connection sees in a repository before the project exists,
 * so the dialog can prefill the name and key from config.yml.
 */
export const DetectBacklogRepositoryInput = z.object({
  /** A clone URL as typed (HTTPS or SSH); read with parseRepositoryUrl. */
  repository: ProjectRepository.refine((value) => value !== '', 'Paste the repository URL'),
  connectionId: GitConnectionId,
  folderOverride: BacklogFolder.optional(),
});
export type DetectBacklogRepositoryInput = z.output<typeof DetectBacklogRepositoryInput>;

/** Setup step 4: a dry run with the mappings from step 3. */
export const PreviewBacklogInput = DetectBacklogInput.extend({
  mappings: BacklogMappings,
});
export type PreviewBacklogInput = z.output<typeof PreviewBacklogInput>;

/** Setup step 5: creates the source and enqueues the first read. Import detaches after it. */
export const StartBacklogInput = PreviewBacklogInput.extend({
  mode: BacklogMode,
});
export type StartBacklogInput = z.output<typeof StartBacklogInput>;

/**
 * New project from Backlog.md: creates the project (key defaults to the prefix when it is a valid
 * project key) and opens setup at the mappings step.
 */
export const CreateProjectFromBacklogInput = z.object({
  repository: ProjectRepository.refine((value) => value !== '', 'Paste the repository URL'),
  connectionId: GitConnectionId,
  name: ProjectName,
  key: ProjectKeyInput,
  mode: BacklogMode,
  folderOverride: BacklogFolder.optional(),
});
export type CreateProjectFromBacklogInput = z.output<typeof CreateProjectFromBacklogInput>;

/** Settings: new mappings, applied to every task on the next refresh. */
export const UpdateBacklogMappingsInput = z.object({
  projectKey: BacklogProjectKey,
  mappings: BacklogMappings,
});
export type UpdateBacklogMappingsInput = z.output<typeof UpdateBacklogMappingsInput>;

/** Settings: null goes back to detecting the folder. */
export const SetBacklogFolderInput = z.object({
  projectKey: BacklogProjectKey,
  folderOverride: BacklogFolder.nullable(),
});
export type SetBacklogFolderInput = z.output<typeof SetBacklogFolderInput>;

/** Settings: read through another connection (a paused mirror whose connection was deleted). */
export const SetBacklogConnectionInput = z.object({
  projectKey: BacklogProjectKey,
  connectionId: GitConnectionId,
});
export type SetBacklogConnectionInput = z.output<typeof SetBacklogConnectionInput>;

/** Settings: Refresh now (trigger manual), webhook info and status for the settings page. */
export const BacklogProjectInput = z.object({
  projectKey: BacklogProjectKey,
});
export type BacklogProjectInput = z.output<typeof BacklogProjectInput>;

export const RefreshBacklogNowInput = BacklogProjectInput;
export type RefreshBacklogNowInput = BacklogProjectInput;

export const BacklogWebhookInfoInput = BacklogProjectInput;
export type BacklogWebhookInfoInput = BacklogProjectInput;

/** Detach for good. confirmKey is the project key typed by the person (any case). */
export const DetachBacklogInput = z
  .object({
    projectKey: BacklogProjectKey,
    confirmKey: z.string().trim().toUpperCase(),
  })
  .refine((value) => value.confirmKey === value.projectKey, {
    path: ['confirmKey'],
    message: 'Type the project key to confirm',
  });
export type DetachBacklogInput = z.output<typeof DetachBacklogInput>;
