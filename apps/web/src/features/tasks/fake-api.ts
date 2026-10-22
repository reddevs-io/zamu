import { ORPCError } from '@orpc/client';
import type {
  Activity,
  Me,
  Member,
  ProjectWithCounts,
  StatusCounts,
  Task,
  TaskListItem,
  TaskListPage,
  TaskStatus,
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

interface Options {
  /** Number of tasks in PAY (default 6). */
  tasks?: number;
}

type Input = Record<string, unknown>;

export function createFakeApi({ tasks: taskCount = 6 }: Options = {}) {
  const now = Date.now();
  const project = { id: '10000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' };
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
      createdAt: new Date(now - (taskCount - index) * 3_600_000).toISOString(),
      updatedAt: new Date(now - (taskCount - index) * 60_000).toISOString(),
    };
  });
  const activity: Activity[] = [];

  const calls = {
    update: [] as Input[],
    create: [] as Input[],
    list: [] as Input[],
  };
  /** Set to make the next tasks.update wait for `release` and then fail (or succeed). */
  const control = {
    failUpdates: false,
    holdUpdates: null as null | { release: () => void; promise: Promise<void> },
  };

  const listItem = (task: Task): TaskListItem => {
    const { description: _d, project: _p, createdBy: _c, createdOnBehalfOf: _o, ...item } = task;
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
        user: { ...people.ana, email: 'ana@example.com', responsible: null },
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
        task.updatedAt = new Date().toISOString();
        return structuredClone(task);
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        tasks.push(task);
        return structuredClone(task);
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

  return { client, calls, control, hold, tasks };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
