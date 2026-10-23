import { ORPCError } from '@orpc/client';
import type {
  Activity,
  Comment,
  Cycle,
  Me,
  Member,
  MilestoneWithProgress,
  ProjectWithCounts,
  StatusCounts,
  Task,
  TaskListItem,
  TaskListPage,
  TaskStatus,
  TimelineItem,
} from '@pm/contracts';
import { PRIORITIES, TASK_STATUSES } from '@pm/contracts';

// In-memory stand-in for the /api/v1 client, for component tests of the task screens. It follows the
// contract's shapes and rules that the screens rely on (ordering, counts ignoring the status filter,
// cursor pagination). Tests replace `client` in ~/lib/orpc with `createFakeApi().client`.

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

interface Options {
  /** Number of tasks in PAY (default 6). */
  tasks?: number;
  /** Project feature switches (default both on). */
  usesMilestones?: boolean;
  usesCycles?: boolean;
}

type Input = Record<string, unknown>;

export function createFakeApi({
  tasks: taskCount = 6,
  usesMilestones = true,
  usesCycles = true,
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

  const calls = {
    update: [] as Input[],
    create: [] as Input[],
    list: [] as Input[],
    comments: [] as Input[],
  };
  /** Set to make the next tasks.update wait for `release` and then fail (or succeed). */
  const control = {
    failUpdates: false,
    holdUpdates: null as null | { release: () => void; promise: Promise<void> },
    /** Comment writes (create, edit) fail with a server error while set. */
    failComments: false,
    /** Comment writes wait for this promise. */
    holdComments: null as null | Promise<void>,
  };

  const listItem = (task: Task): TaskListItem => {
    const { description: _d, createdBy: _c, createdOnBehalfOf: _o, ...item } = task;
    return item;
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
  const find = (key: unknown) => {
    const task = tasks.find((candidate) => candidate.key === String(key).toUpperCase());
    if (!task)
      throw new ORPCError('NOT_FOUND', { message: 'Task not found', data: { requestId: 'req_test404' } });
    return task;
  };
  const asList = (value: unknown) => (value == null ? undefined : Array.isArray(value) ? value : [value]);

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
        const matching = sorted().filter(
          (task) => !q || task.title.toLowerCase().includes(q) || task.key.toLowerCase().includes(q),
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
      get: async (input: Input): Promise<Task> => structuredClone(find(input.key)),
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
        if (control.failUpdates) {
          throw new ORPCError('UNPROCESSABLE_CONTENT', {
            message: 'Title is too long',
            data: { requestId: 'req_fail1' },
          });
        }
        const task = find(input.key);
        if (typeof input.title === 'string') task.title = input.title;
        if (input.description !== undefined) task.description = input.description as string | null;
        if (typeof input.status === 'string') task.status = input.status as TaskStatus;
        if (typeof input.priority === 'string') task.priority = input.priority as Task['priority'];
        if (input.milestone !== undefined) task.milestone = milestoneRef(input.milestone);
        if (input.cycle !== undefined) {
          task.cycle = cycleRef(input.cycle);
          task.cycleAddedAt = task.cycle ? new Date().toISOString() : null;
        }
        task.updatedAt = new Date().toISOString();
        return structuredClone(task);
      },
      timeline: async (input: Input): Promise<{ items: TimelineItem[] }> => {
        const task = find(input.key);
        const items: TimelineItem[] = [
          {
            id: `40000000-0000-4000-8000-${String(task.number).padStart(12, '0')}`,
            type: 'task.created',
            taskKey: task.key,
            actor: people.ana,
            onBehalfOf: null,
            changes: [],
            createdAt: task.createdAt,
            kind: 'activity',
          },
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
        const number = tasks.length + 1;
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
          assignee: person ? { ...person, responsible: person.kind === 'agent' ? people.ana : null } : null,
          createdBy: people.ana,
          createdOnBehalfOf: null,
          milestone: milestoneRef(input.milestone),
          cycle: cycleRef(input.cycle),
          cycleAddedAt: input.cycle != null ? new Date().toISOString() : null,
          // New tasks go to the top of their column.
          rank: Math.min(0, ...tasks.map((other) => other.rank)) - 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        tasks.push(task);
        return structuredClone(task);
      },
    },
    milestones: {
      list: async (): Promise<{ items: MilestoneWithProgress[] }> => structuredClone({ items: milestones }),
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

  return { client, calls, control, hold, tasks, activity, comments, milestones, cycles };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
