import { z } from 'zod';
import { ApiKeyScope, MAX_COMMENT_LENGTH } from './entities';
import {
  AuthId,
  CalendarDate,
  CommentId,
  CycleNumber,
  CycleSelector,
  CycleState,
  cycleLengthDays,
  MAX_CYCLE_DAYS,
  MilestoneId,
  MilestoneStatus,
  Priority,
  ProjectKeyInput,
  TaskKeyInput,
  TaskStatus,
  Theme,
  UserId,
} from './primitives';

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
  })
  .refine(requireOneOf(['key', 'name', 'description', 'usesMilestones', 'usesCycles']), {
    message: 'Change at least one of key, name, description, usesMilestones or usesCycles',
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
  /** Matches the title or the task key. */
  q: z.string().trim().max(200).optional(),
  order: TaskListOrder.default('list'),
  /** Only valid with the same order and filters it came from. */
  cursor: z.string().min(1).max(512).optional(),
  /** Query strings carry numbers as text, so this coerces. */
  limit: z.coerce.number<number>().int().min(1).max(MAX_TASK_LIST_LIMIT).default(DEFAULT_TASK_LIST_LIMIT),
});
export type ListTasksInput = z.output<typeof ListTasksInput>;

export const GetTaskInput = z.object({
  key: TaskKeyInput,
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
    key: TaskKeyInput,
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
  key: TaskKeyInput,
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
