import { ORPCError } from '@orpc/client';
import type {
  Activity,
  Comment,
  Cycle,
  Label,
  LabelWithUsage,
  Me,
  Member,
  MilestoneWithProgress,
  ProjectActivity,
  ProjectBacklogSummary,
  ProjectWithCounts,
  RelatedTask,
  StatusCounts,
  Task,
  TaskBulkResult,
  TaskListItem,
  TaskListPage,
  TaskOwnedField,
  TaskStatus,
  TimelineItem,
} from '@pm/contracts';
import { isOpenStatus, PRIORITIES, TASK_STATUSES } from '@pm/contracts';

// In-memory stand-in for the /api/v1 client, for component tests of the task screens. It follows the
// contract's shapes and rules that the screens rely on (ordering, counts ignoring the status filter,
// cursor pagination, and from M5 labels, due dates, blockers with loop refusal, one level of
// subtasks, bulk changes for native tasks only). Tests replace `client` in ~/lib/orpc with
// `createFakeApi().client`.

const ANA = '00000000-0000-4000-8000-000000000001';
const TOMAS = '00000000-0000-4000-8000-000000000002';
const CLAUDE = '00000000-0000-4000-8000-000000000003';

const people = {
  ana: { id: ANA, name: 'Ana Ruiz', kind: 'person' as const },
  tomas: { id: TOMAS, name: 'Tomás Berg', kind: 'person' as const },
  claude: { id: CLAUDE, name: 'claude-dev', kind: 'agent' as const },
};

export const FAKE_PEOPLE = people;

export const FAKE_MILESTONES = {
  pci: '50000000-0000-4000-8000-000000000001',
  webhooks: '50000000-0000-4000-8000-000000000002',
};
export const FAKE_CYCLES = {
  c12: '60000000-0000-4000-8000-000000000012',
  c13: '60000000-0000-4000-8000-000000000013',
};

/** The labels of PAY: name and palette hue. */
export const FAKE_LABELS: readonly (readonly [string, number])[] = [
  ['api', 1],
  ['backend', 2],
  ['payouts', 6],
  ['refunds', 4],
  ['reliability', 9],
];

interface Options {
  /** Number of tasks in PAY (default 6). */
  tasks?: number;
  /** Project feature switches (default both on). */
  usesMilestones?: boolean;
  usesCycles?: boolean;
  /**
   * M5 sample values (default off, so older tests keep their rows): PAY-1 has the labels payouts and
   * backend and is due in 2 days, PAY-2 waits on PAY-3, PAY-5 is a subtask of PAY-1.
   */
  fields?: boolean;
}

type Input = Record<string, unknown>;

export function createFakeApi({
  tasks: taskCount = 6,
  usesMilestones = true,
  usesCycles = true,
  fields = false,
}: Options = {}) {
  const now = Date.now();
  const project = { id: '10000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' };
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
  const progress = { total: 4, done: 2, inProgress: 1, open: 1, canceled: 0 };
  const milestones: MilestoneWithProgress[] = [
    { id: FAKE_MILESTONES.pci, name: 'PCI audit', targetDate: day(-3), status: 'active', overdue: true },
    {
      id: FAKE_MILESTONES.webhooks,
      name: 'Webhooks v2',
      targetDate: day(20),
      status: 'active',
      overdue: false,
    },
  ].map((item) => ({
    ...item,
    project,
    description: null,
    status: item.status as MilestoneWithProgress['status'],
    completedAt: null,
    createdBy: people.ana,
    createdAt: new Date(now - 86_400_000).toISOString(),
    updatedAt: new Date(now - 86_400_000).toISOString(),
    progress,
    daysLeft: item.overdue ? -3 : 20,
  }));
  const counts = { backlog: 0, todo: 1, in_progress: 1, in_review: 0, done: 0, canceled: 0 };
  const cycleCounts = { ...counts, total: 2, addedAfterStart: 0, unassigned: 0, agents: 1 };
  const cycles: Cycle[] = [
    {
      id: FAKE_CYCLES.c12,
      number: 12,
      startsOn: day(-10),
      endsOn: day(3),
      state: 'current' as const,
      daysLeft: 4,
    },
    {
      id: FAKE_CYCLES.c13,
      number: 13,
      startsOn: day(4),
      endsOn: day(17),
      state: 'upcoming' as const,
      daysLeft: null,
    },
  ].map((item) => ({
    ...item,
    project,
    name: null,
    counts: cycleCounts,
    completedAt: null,
    endedBy: null,
    summary: null,
  }));
  const milestoneRef = (id: unknown) => {
    const found = milestones.find((item) => item.id === id);
    return found
      ? { id: found.id, name: found.name, status: found.status, targetDate: found.targetDate }
      : null;
  };
  const cycleRef = (number: unknown) => {
    const found = cycles.find((item) => item.number === Number(number));
    return found
      ? {
          id: found.id,
          number: found.number,
          name: found.name,
          startsOn: found.startsOn,
          endsOn: found.endsOn,
          state: found.state,
        }
      : null;
  };
  const statuses: TaskStatus[] = ['in_progress', 'in_review', 'todo', 'todo', 'backlog', 'done'];
  const tasks: Task[] = Array.from({ length: taskCount }, (_, index) => {
    const number = index + 1;
    const assignee =
      index % 3 === 0
        ? { ...people.claude, responsible: people.ana }
        : index % 3 === 1
          ? { ...people.tomas, responsible: null }
          : null;
    return {
      id: `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
      key: `PAY-${number}`,
      number,
      project,
      title: `Task number ${number}`,
      description: number === 1 ? 'First line.\n\n- [x] Done thing\n- [ ] Open thing' : null,
      status: statuses[index % statuses.length] ?? 'todo',
      priority: PRIORITIES[(index * 3) % 5] ?? 'none',
      assignee,
      createdBy: people.ana,
      createdOnBehalfOf: null,
      milestone: null,
      cycle: null,
      cycleAddedAt: null,
      rank: number,
      createdAt: new Date(now - (taskCount - index) * 3_600_000).toISOString(),
      updatedAt: new Date(now - (taskCount - index) * 60_000).toISOString(),
    };
  });
  // M5: labels of the project, and the relations by task key (blockedBy lists, parent of subtasks).
  const labels: Label[] = FAKE_LABELS.map(([name, color], index) => ({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name,
    color,
    source: 'app' as const,
  }));
  const blockers = new Map<string, string[]>();
  const parents = new Map<string, string>();
  for (const task of tasks) {
    task.labels = [];
    task.dueDate = null;
  }
  if (fields) {
    const pay1 = tasks[0];
    if (pay1) {
      pay1.labels = labels.filter((label) => label.name === 'payouts' || label.name === 'backend');
      pay1.dueDate = day(2);
    }
    if (tasks.length >= 3) blockers.set('PAY-2', ['PAY-3']);
    if (tasks.length >= 5) parents.set('PAY-5', 'PAY-1');
  }
  const activity: Activity[] = [];
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const comments: Comment[] = [
    {
      id: '70000000-0000-4000-8000-000000000001',
      taskKey: 'PAY-1',
      author: people.tomas,
      onBehalfOf: null,
      body: 'Should 429 count toward the 6 attempts?',
      mentions: [],
      createdAt: at(32),
      editedAt: at(30),
      deletedAt: null,
    },
    {
      id: '70000000-0000-4000-8000-000000000002',
      taskKey: 'PAY-1',
      author: people.ana,
      onBehalfOf: null,
      body: `No, honour Retry-After. [@claude-dev](mention:${CLAUDE}) can you cover that in the tests? [docs](https://example.com/retry) [bad](javascript:alert(1))`,
      mentions: [people.claude],
      createdAt: at(28),
      editedAt: null,
      deletedAt: null,
    },
    {
      id: '70000000-0000-4000-8000-000000000003',
      taskKey: 'PAY-1',
      author: people.tomas,
      onBehalfOf: null,
      body: null,
      mentions: [],
      createdAt: at(70),
      editedAt: null,
      deletedAt: at(60),
    },
    {
      id: '70000000-0000-4000-8000-000000000004',
      taskKey: 'PAY-1',
      author: people.claude,
      onBehalfOf: people.ana,
      body: 'Done. Retries now run as jobs:\n\n```\nattempt  delay\n1        30s\n```\n\n- 4xx stops retrying\n- Tests: 14 new cases',
      mentions: [],
      createdAt: at(3),
      editedAt: null,
      deletedAt: null,
    },
  ];

  /** M3: the project's Backlog.md summary and project-level history (see `mirrorTask`). */
  const mirror = {
    summary: null as ProjectBacklogSummary | null,
    history: [] as ProjectActivity[],
  };

  const calls = {
    update: [] as Input[],
    create: [] as Input[],
    list: [] as Input[],
    comments: [] as Input[],
    bulk: [] as Input[],
    labels: [] as Input[],
  };
  /** Set to make the next tasks.update wait for `release` and then fail (or succeed). */
  const control = {
    failUpdates: false,
    holdUpdates: null as null | { release: () => void; promise: Promise<void> },
    /** Comment writes (create, edit) fail with a server error while set. */
    failComments: false,
    /** Comment writes wait for this promise. */
    holdComments: null as null | Promise<void>,
    /** The next task write (update, create or bulk) fails with this error, once. */
    failNext: null as null | ORPCError<string, unknown>,
  };

  const byKey = (key: string) => tasks.find((task) => task.key === key);
  const related = (task: Task): RelatedTask => ({
    key: task.key,
    title: task.title,
    status: task.status,
    assignee: task.assignee
      ? { id: task.assignee.id, name: task.assignee.name, kind: task.assignee.kind }
      : null,
  });
  /** Hidden tasks read as null ("Removed task"). */
  const relatedOrNull = (key: string) => {
    const task = byKey(key);
    return task && !task.hidden ? related(task) : null;
  };
  const subtasksOf = (key: string) =>
    tasks.filter((task) => parents.get(task.key) === key && !task.hidden).sort((a, b) => a.number - b.number);
  const progressOf = (key: string) => {
    const counted = subtasksOf(key).filter((task) => task.status !== 'canceled');
    return { done: counted.filter((task) => task.status === 'done').length, total: counted.length };
  };
  const isBlocked = (key: string) =>
    (blockers.get(key) ?? []).some((other) => {
      const task = byKey(other);
      return task != null && !task.hidden && isOpenStatus(task.status);
    });
  const sortLabels = (list: Label[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  /** The task with its M5 relations, as tasks.get answers. */
  const full = (task: Task): Task => {
    const parentKey = parents.get(task.key);
    return {
      ...task,
      labels: sortLabels(task.labels ?? []),
      dueDate: task.dueDate ?? null,
      parent: parentKey ? relatedOrNull(parentKey) : null,
      subtasks: subtasksOf(task.key).map(related),
      subtaskProgress: progressOf(task.key),
      blockedBy: (blockers.get(task.key) ?? []).map(relatedOrNull),
      blocks: [...blockers.entries()]
        .filter(([, list]) => list.includes(task.key))
        .map(([key]) => relatedOrNull(key)),
      blocked: isBlocked(task.key),
    };
  };
  const listItem = (task: Task): TaskListItem => {
    const {
      description: _d,
      createdBy: _c,
      createdOnBehalfOf: _o,
      parent: _p,
      subtasks: _s,
      blockedBy: _b,
      blocks: _r,
      ...item
    } = full(task);
    return { ...item, parentKey: parents.get(task.key) ?? null };
  };
  const rank = (task: Task) => TASK_STATUSES.indexOf(task.status);
  const sorted = () =>
    [...tasks].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.number - a.number,
    );
  /** tasks.list order: `sort` (one ordering for the whole result) or the list order by status. */
  const sortedFor = (input: Input) => {
    const sort = typeof input.sort === 'string' ? input.sort : undefined;
    if (!sort) return sorted();
    const byPriority = (a: Task, b: Task) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
    const byUpdated = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt);
    const compare: Record<string, (a: Task, b: Task) => number> = {
      priority: (a, b) => byPriority(a, b) || byUpdated(a, b),
      updated: byUpdated,
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      // No date last.
      due: (a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || byPriority(a, b),
      manual: (a, b) => a.rank - b.rank,
    };
    const by = compare[sort] ?? compare.priority;
    return [...tasks].sort((a, b) => (by as (x: Task, y: Task) => number)(a, b) || b.number - a.number);
  };
  /** One assignee filter value: me (Ana), agents, none or a user id. */
  const assigneeMatches = (task: Task, value: string) => {
    if (value === 'none') return !task.assignee;
    if (!task.assignee) return false;
    if (value === 'me') return task.assignee.id === people.ana.id;
    if (value === 'agents') return task.assignee.kind === 'agent';
    return task.assignee.id === value;
  };
  /** One cycle filter value: a number, current, next (the first upcoming) or none. */
  const cycleMatches = (task: Task, value: string | number) => {
    if (value === 'none') return !task.cycle;
    if (!task.cycle) return false;
    if (value === 'current') return task.cycle.state === 'current';
    if (value === 'next') return task.cycle.number === cycles.find((c) => c.state === 'upcoming')?.number;
    return task.cycle.number === Number(value);
  };
  /** overdue, soon (today to 2 days ahead), none or set; overdue and soon count open tasks only. */
  const dueMatches = (task: Task, due: string, today: string, soon: string) => {
    const date = task.dueDate ?? null;
    if (due === 'none') return date === null;
    if (due === 'set') return date !== null;
    if (date === null || !isOpenStatus(task.status)) return false;
    if (due === 'overdue') return date < today;
    return date >= today && date <= soon;
  };
  const find = (key: unknown) => {
    const task = tasks.find((candidate) => candidate.key === String(key).toUpperCase());
    if (!task)
      throw new ORPCError('NOT_FOUND', { message: 'Task not found', data: { requestId: 'req_test404' } });
    return task;
  };
  const asList = (value: unknown) => (value == null ? undefined : Array.isArray(value) ? value : [value]);

  const failIfAsked = () => {
    const error = control.failNext;
    if (!error) return;
    control.failNext = null;
    throw error;
  };
  const labelNamed = (name: string) =>
    labels.find((label) => label.name.toLowerCase() === name.trim().toLowerCase());
  const newLabel = (name: string, color?: number): Label => {
    const label: Label = {
      id: `80000000-0000-4000-8000-${String(100 + labels.length).padStart(12, '0')}`,
      name,
      color: color ?? (labels.length % 9) + 1,
      source: 'app',
    };
    labels.push(label);
    return label;
  };
  /** Labels by name; missing ones are created, as task writes do. */
  const resolveLabels = (names: readonly string[]) => {
    const result: Label[] = [];
    for (const name of names) {
      const label = labelNamed(name) ?? newLabel(name.trim());
      if (!result.some((item) => item.id === label.id)) result.push({ ...label });
    }
    return result;
  };
  /** The fields from TASK_OWNED_FIELDS each input key writes. */
  const OWNED_BY_INPUT: Record<string, TaskOwnedField> = {
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    assignee: 'assignee',
    milestone: 'milestone',
    labels: 'labels',
    addLabels: 'labels',
    removeLabels: 'labels',
    dueDate: 'dueDate',
    parent: 'parent',
    addBlockers: 'blockedBy',
    removeBlockers: 'blockedBy',
  };
  const refuseMirrored = (task: Task, input: Input) => {
    for (const [name, field] of Object.entries(OWNED_BY_INPUT)) {
      if (input[name] === undefined || !task.locked?.includes(field)) continue;
      throw new ORPCError('TASK_MIRRORED', {
        status: 409,
        message: `${field} comes from Backlog.md`,
        data: { field },
      });
    }
  };
  const depthError = (key: string) =>
    new ORPCError('SUBTASK_DEPTH', {
      status: 409,
      message: `${key} is a subtask. Subtasks go one level deep.`,
    });
  const setParent = (task: Task, value: string | null) => {
    if (value === null) {
      parents.delete(task.key);
      return;
    }
    const parent = find(value);
    if (parent.key === task.key || parents.has(parent.key)) throw depthError(parent.key);
    if (subtasksOf(task.key).length > 0) {
      throw new ORPCError('SUBTASK_DEPTH', {
        status: 409,
        message: `${task.key} has subtasks. Subtasks go one level deep.`,
      });
    }
    parents.set(task.key, parent.key);
  };
  /** True when `from` waits on `to`, directly or through other tasks. */
  const waitsOn = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    return (blockers.get(from) ?? []).some((key) => key === to || waitsOn(key, to, seen));
  };
  const addBlocker = (task: Task, value: string) => {
    const blocker = find(value);
    const current = blockers.get(task.key) ?? [];
    if (current.includes(blocker.key)) return;
    if (blocker.key === task.key || waitsOn(blocker.key, task.key)) {
      const message = `Can't add: ${blocker.key} already waits on ${task.key}.`;
      throw new ORPCError('DEPENDENCY_LOOP', {
        status: 409,
        message,
        data: {
          loop: { task: task.key, blocker: blocker.key },
          issues: [{ path: 'addBlockers', message }],
        },
      });
    }
    blockers.set(task.key, [...current, blocker.key]);
  };
  const personById = (id: string) => Object.values(people).find((candidate) => candidate.id === id);
  /** The plain fields of a task write (update and bulk). */
  const applyFields = (task: Task, input: Input) => {
    if (typeof input.title === 'string') task.title = input.title;
    if (input.description !== undefined) task.description = input.description as string | null;
    if (typeof input.status === 'string') task.status = input.status as TaskStatus;
    if (typeof input.priority === 'string') task.priority = input.priority as Task['priority'];
    if (input.assignee !== undefined) {
      const person = typeof input.assignee === 'string' ? personById(input.assignee) : undefined;
      task.assignee = person ? { ...person, responsible: person.kind === 'agent' ? people.ana : null } : null;
    }
    if (input.milestone !== undefined) task.milestone = milestoneRef(input.milestone);
    if (input.cycle !== undefined) {
      task.cycle = cycleRef(input.cycle);
      task.cycleAddedAt = task.cycle ? new Date().toISOString() : null;
    }
    if (input.dueDate !== undefined) task.dueDate = input.dueDate as string | null;
    if (Array.isArray(input.labels)) task.labels = resolveLabels(input.labels as string[]);
    if (Array.isArray(input.removeLabels)) {
      const removed = new Set((input.removeLabels as string[]).map((name) => name.toLowerCase()));
      task.labels = (task.labels ?? []).filter((label) => !removed.has(label.name.toLowerCase()));
    }
    if (Array.isArray(input.addLabels)) {
      const current = task.labels ?? [];
      const added = resolveLabels(input.addLabels as string[]).filter(
        (label) => !current.some((item) => item.id === label.id),
      );
      task.labels = [...current, ...added];
    }
  };

  const client = {
    me: {
      get: async (): Promise<Me> => ({
        user: { ...people.ana, email: 'ana@example.com', responsible: null, theme: 'system' },
        workspace: { id: '30000000-0000-4000-8000-000000000001', name: 'Reddevs', slug: 'reddevs' },
        role: 'owner',
        auth: { method: 'session', scope: null },
      }),
    },
    projects: {
      list: async (): Promise<{ items: ProjectWithCounts[] }> => {
        const open = tasks.filter((task) =>
          ['backlog', 'todo', 'in_progress', 'in_review'].includes(task.status),
        );
        const count = (status: TaskStatus) => open.filter((task) => task.status === status).length;
        return {
          items: [
            {
              ...project,
              description: null,
              usesMilestones,
              usesCycles,
              currentCycle: null,
              repository: null,
              createdAt: new Date(now - 86_400_000).toISOString(),
              updatedAt: new Date(now).toISOString(),
              openCounts: {
                backlog: count('backlog'),
                todo: count('todo'),
                in_progress: count('in_progress'),
                in_review: count('in_review'),
              },
              openCount: open.length,
              lastActivityAt: new Date(now).toISOString(),
              assignees: [],
              backlog: mirror.summary,
            },
          ],
        };
      },
    },
    members: {
      list: async (): Promise<{ items: Member[] }> => ({
        items: [people.ana, people.tomas, people.claude].map((person) => ({
          ...person,
          email: person.kind === 'agent' ? null : `${person.name}@example.com`,
          role: 'member' as const,
          responsible: person.kind === 'agent' ? people.ana : null,
          lastActiveAt: null,
          apiKeyCount: 0,
          joinedAt: new Date(now).toISOString(),
        })),
      }),
    },
    tasks: {
      list: async (input: Input): Promise<TaskListPage> => {
        calls.list.push(input);
        const status = asList(input.status) as TaskStatus[] | undefined;
        const q = typeof input.q === 'string' ? input.q.toLowerCase() : undefined;
        const labelIds = asList(input.label) as string[] | undefined;
        const parent = typeof input.parent === 'string' ? input.parent.toUpperCase() : undefined;
        const priorities = asList(input.priority) as string[] | undefined;
        const assignees = asList(input.assignee) as string[] | undefined;
        const milestoneIds = asList(input.milestone) as string[] | undefined;
        const cycleValues = asList(input.cycle) as (string | number)[] | undefined;
        const due = typeof input.due === 'string' ? input.due : undefined;
        const today = day(0);
        const soon = day(2);
        const matching = sortedFor(input).filter(
          (task) =>
            (input.hidden === 'only' ? task.hidden === true : !task.hidden) &&
            (!q || task.title.toLowerCase().includes(q) || task.key.toLowerCase().includes(q)) &&
            (!priorities || priorities.includes(task.priority)) &&
            (!assignees || assignees.some((value) => assigneeMatches(task, value))) &&
            (!milestoneIds ||
              milestoneIds.some((value) =>
                value === 'none' ? !task.milestone : task.milestone?.id === value,
              )) &&
            (!cycleValues || cycleValues.some((value) => cycleMatches(task, value))) &&
            (!due || dueMatches(task, due, today, soon)) &&
            (!labelIds || (task.labels ?? []).some((label) => labelIds.includes(label.id))) &&
            (input.topLevel !== true || !parents.has(task.key)) &&
            (input.blocked === undefined || isBlocked(task.key) === input.blocked) &&
            (!parent || parents.get(task.key) === parent),
        );
        const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as StatusCounts;
        for (const task of matching) counts[task.status]++;
        const filtered = matching.filter((task) => !status || status.includes(task.status));
        const limit = Number(input.limit ?? 50);
        const offset = Number(input.cursor ?? 0);
        const page = filtered.slice(offset, offset + limit);
        const next = offset + limit < filtered.length ? String(offset + limit) : null;
        return { items: page.map(listItem), nextCursor: next, counts };
      },
      get: async (input: Input): Promise<Task> => structuredClone(full(find(input.key))),
      activity: async (input: Input): Promise<{ items: Activity[] }> => {
        const task = find(input.key);
        return {
          items: [
            {
              id: `40000000-0000-4000-8000-${String(task.number).padStart(12, '0')}`,
              type: 'task.created',
              taskKey: task.key,
              actor: people.ana,
              onBehalfOf: null,
              changes: [],
              createdAt: task.createdAt,
            },
            ...activity.filter((item) => item.taskKey === task.key),
          ],
        };
      },
      update: async (input: Input): Promise<Task> => {
        calls.update.push(input);
        if (control.holdUpdates) await control.holdUpdates.promise;
        failIfAsked();
        if (control.failUpdates) {
          throw new ORPCError('UNPROCESSABLE_CONTENT', {
            message: 'Title is too long',
            data: { requestId: 'req_fail1' },
          });
        }
        const task = find(input.key);
        refuseMirrored(task, input);
        if (typeof input.ifUpdatedAt === 'string' && input.ifUpdatedAt < task.updatedAt) {
          throw new ORPCError('TASK_CHANGED', {
            status: 409,
            message: 'The task changed since you loaded it',
            data: { task: structuredClone(full(task)) },
          });
        }
        if (input.parent !== undefined) setParent(task, input.parent as string | null);
        if (Array.isArray(input.addBlockers)) {
          for (const key of input.addBlockers as string[]) addBlocker(task, key);
        }
        if (Array.isArray(input.removeBlockers)) {
          const removed = new Set((input.removeBlockers as string[]).map((key) => key.toUpperCase()));
          blockers.set(
            task.key,
            (blockers.get(task.key) ?? []).filter((key) => !removed.has(key)),
          );
        }
        applyFields(task, input);
        task.updatedAt = new Date().toISOString();
        return structuredClone(full(task));
      },
      bulkUpdate: async (input: Input): Promise<TaskBulkResult> => {
        calls.bulk.push(input);
        if (control.holdUpdates) await control.holdUpdates.promise;
        failIfAsked();
        const keys = [...new Set((input.keys as string[]).map((key) => key.toUpperCase()))];
        const targets = keys.map(find);
        const mirrored = targets.find((task) => (task.locked?.length ?? 0) > 0);
        if (mirrored) {
          throw new ORPCError('TASK_MIRRORED', {
            status: 409,
            message: `${mirrored.key} comes from Backlog.md`,
            data: { field: 'status' },
          });
        }
        const now = new Date().toISOString();
        for (const task of targets) {
          applyFields(task, input);
          task.updatedAt = now;
        }
        return structuredClone({ items: targets.map(listItem) });
      },
      timeline: async (input: Input): Promise<{ items: TimelineItem[] }> => {
        const task = find(input.key);
        const items: TimelineItem[] = [
          // Tasks of a Backlog.md first read have no "created" entry: the project-level one stands in.
          ...(task.backlog
            ? []
            : [
                {
                  id: `40000000-0000-4000-8000-${String(task.number).padStart(12, '0')}`,
                  type: 'task.created' as const,
                  taskKey: task.key,
                  actor: people.ana,
                  onBehalfOf: null,
                  changes: [],
                  createdAt: task.createdAt,
                  kind: 'activity' as const,
                },
              ]),
          ...activity
            .filter((item) => item.taskKey === task.key)
            .map((item) => ({ ...item, kind: 'activity' as const })),
          ...comments
            .filter((item) => item.taskKey === task.key)
            .map((item) => ({ ...item, kind: 'comment' as const })),
        ];
        items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return structuredClone({ items });
      },
      create: async (input: Input): Promise<Task> => {
        calls.create.push(input);
        failIfAsked();
        const number = tasks.length + 1;
        const parentKey = typeof input.parent === 'string' ? input.parent.toUpperCase() : null;
        const parentTask = parentKey ? find(parentKey) : null;
        if (parentTask && parents.has(parentTask.key)) throw depthError(parentTask.key);
        const assigneeId = input.assignee as string | null | undefined;
        const person = Object.values(people).find((candidate) => candidate.id === assigneeId);
        const task: Task = {
          id: `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
          key: `PAY-${number}`,
          number,
          project,
          title: String(input.title),
          description: (input.description as string | undefined) ?? null,
          status: (input.status as TaskStatus | undefined) ?? 'todo',
          priority: (input.priority as Task['priority'] | undefined) ?? 'none',
          assignee: person
            ? { ...person, responsible: person.kind === 'agent' ? people.ana : null }
            : // A subtask without an assignee takes the parent's.
              assigneeId === undefined && parentTask
              ? structuredClone(parentTask.assignee)
              : null,
          createdBy: people.ana,
          createdOnBehalfOf: null,
          milestone: milestoneRef(input.milestone),
          cycle: cycleRef(input.cycle),
          cycleAddedAt: input.cycle != null ? new Date().toISOString() : null,
          // New tasks go to the top of their column.
          rank: Math.min(0, ...tasks.map((other) => other.rank)) - 1,
          labels: [],
          dueDate: (input.dueDate as string | null | undefined) ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        tasks.push(task);
        if (Array.isArray(input.labels)) task.labels = resolveLabels(input.labels as string[]);
        if (parentTask) parents.set(task.key, parentTask.key);
        if (Array.isArray(input.blockedBy)) {
          for (const key of input.blockedBy as string[]) addBlocker(task, key);
        }
        return structuredClone(full(task));
      },
    },
    labels: {
      list: async (): Promise<{ items: LabelWithUsage[] }> => ({
        items: sortLabels(labels).map((label) => ({
          ...label,
          usageCount: tasks.filter(
            (task) => !task.hidden && (task.labels ?? []).some((other) => other.id === label.id),
          ).length,
        })),
      }),
      create: async (input: Input): Promise<LabelWithUsage> => {
        calls.labels.push({ op: 'create', ...input });
        const name = String(input.name).trim();
        if (labelNamed(name)) {
          throw new ORPCError('LABEL_EXISTS', {
            status: 409,
            message: `Payments has a label named “${labelNamed(name)?.name}”.`,
          });
        }
        const label = newLabel(name, typeof input.color === 'number' ? input.color : undefined);
        return structuredClone({ ...label, usageCount: 0 });
      },
      update: async (input: Input): Promise<LabelWithUsage> => {
        calls.labels.push({ op: 'update', ...input });
        const label = labels.find((item) => item.id === input.id);
        if (!label) throw new ORPCError('NOT_FOUND', { message: 'Label not found' });
        if (typeof input.name === 'string') label.name = input.name;
        if (typeof input.color === 'number') label.color = input.color;
        for (const task of tasks) {
          task.labels = (task.labels ?? []).map((item) => (item.id === label.id ? { ...label } : item));
        }
        return structuredClone({ ...label, usageCount: 0 });
      },
      delete: async (input: Input): Promise<void> => {
        calls.labels.push({ op: 'delete', ...input });
        const index = labels.findIndex((item) => item.id === input.id);
        if (index < 0) throw new ORPCError('NOT_FOUND', { message: 'Label not found' });
        labels.splice(index, 1);
        for (const task of tasks) task.labels = (task.labels ?? []).filter((item) => item.id !== input.id);
      },
    },
    milestones: {
      list: async (): Promise<{ items: MilestoneWithProgress[] }> => structuredClone({ items: milestones }),
    },
    backlog: {
      /** Only the history: the task screens read nothing else from the source status. */
      status: async (): Promise<{ history: ProjectActivity[] }> => {
        if (!mirror.summary) throw new ORPCError('NOT_FOUND', { message: 'No Backlog.md source' });
        return structuredClone({ history: mirror.history });
      },
    },
    cycles: {
      list: async (): Promise<{ items: Cycle[] }> => structuredClone({ items: cycles }),
    },
    comments: {
      create: async (input: Input): Promise<Comment> => {
        calls.comments.push({ op: 'create', ...input });
        if (control.holdComments) await control.holdComments;
        if (control.failComments) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500, message: 'boom' });
        }
        const task = find(input.key);
        const comment: Comment = {
          id: `70000000-0000-4000-8000-${String(100 + comments.length).padStart(12, '0')}`,
          taskKey: task.key,
          author: people.ana,
          onBehalfOf: null,
          body: String(input.body),
          mentions: String(input.body).includes(`mention:${CLAUDE}`) ? [people.claude] : [],
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
        };
        comments.push(comment);
        return structuredClone(comment);
      },
      update: async (input: Input): Promise<Comment> => {
        calls.comments.push({ op: 'update', ...input });
        if (control.holdComments) await control.holdComments;
        if (control.failComments) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500, message: 'boom' });
        }
        const comment = comments.find((item) => item.id === input.id);
        if (!comment) throw new ORPCError('NOT_FOUND', { message: 'Comment not found' });
        comment.body = String(input.body);
        comment.editedAt = new Date().toISOString();
        return structuredClone(comment);
      },
      delete: async (input: Input): Promise<Comment> => {
        calls.comments.push({ op: 'delete', ...input });
        const comment = comments.find((item) => item.id === input.id);
        if (!comment) throw new ORPCError('NOT_FOUND', { message: 'Comment not found' });
        comment.body = null;
        comment.mentions = [];
        comment.deletedAt = new Date().toISOString();
        return structuredClone(comment);
      },
    },
  };

  const hold = () => {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    control.holdUpdates = { release, promise };
    return release;
  };

  return {
    client,
    calls,
    control,
    hold,
    tasks,
    activity,
    comments,
    milestones,
    cycles,
    mirror,
    labels,
    /** M5 relations by task key: the keys each task waits on, and the parent of each subtask. */
    blockers,
    parents,
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
