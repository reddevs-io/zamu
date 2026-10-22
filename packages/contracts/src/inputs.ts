import { z } from 'zod';
import { ApiKeyScope } from './entities';
import { AuthId, Priority, ProjectKeyInput, TaskKeyInput, TaskStatus, UserId } from './primitives';

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
  })
  .refine(requireOneOf(['key', 'name', 'description']), {
    message: 'Change at least one of key, name or description',
  });
export type UpdateProjectInput = z.output<typeof UpdateProjectInput>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const ListTasksInput = z.object({
  project: ProjectKeyInput,
  status: oneOrMany(TaskStatus).optional(),
  priority: oneOrMany(Priority).optional(),
  assignee: AssigneeFilter.optional(),
  /** Matches the title or the task key. */
  q: z.string().trim().max(200).optional(),
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

export const CreateTaskInput = z.object({
  project: ProjectKeyInput,
  title: TaskTitle,
  description: TaskDescription.optional(),
  status: TaskStatus.default(DEFAULT_TASK_STATUS),
  priority: Priority.default(DEFAULT_TASK_PRIORITY),
  /** Omitted or null leaves the task unassigned. */
  assignee: AssigneeInput.nullable().optional(),
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
  })
  .refine(requireOneOf(['title', 'description', 'status', 'priority', 'assignee']), {
    message: 'Change at least one of title, description, status, priority or assignee',
  });
export type UpdateTaskInput = z.output<typeof UpdateTaskInput>;

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
