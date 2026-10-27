import { ORPCError } from '@orpc/client';
import type { Me, ProjectWithCounts, StatusCounts, TaskListItem, TaskStatus } from '@pm/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UIProvider } from '~/ui';
import { MyTasksScreen } from './MyTasksScreen';
import { parseMyTasksSearch } from './search';

// My tasks against an in-memory /api/v1 client inside a real TanStack router, so selection and filters go
// through the URL. The task panel is a stub: its own tests live with the task screens.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

interface FakeState {
  items: TaskListItem[];
  failList: boolean;
  listCalls: Record<string, unknown>[];
}

const api = vi.hoisted(() => ({ current: null as null | { client: unknown; state: FakeState } }));

vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const forward = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === 'string' ? forward([...path, key]) : undefined),
      apply: (_target, _this, args) => {
        // biome-ignore lint/suspicious/noExplicitAny: walking the fake client by path
        const fn = path.reduce<any>((node, key) => node[key], api.current?.client);
        return fn(...args);
      },
    });
  const client = forward([]);
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

vi.mock('~/features/tasks/TaskDetailPane', () => ({
  TaskDetailPane: (props: {
    projectKey: string;
    taskKey: string;
    showProject?: boolean;
    onClose: () => void;
  }) => (
    <div>
      <span>
        pane {props.projectKey} {props.taskKey} {props.showProject ? 'with project' : 'without project'}
      </span>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  ),
  RequestHint: () => null,
}));

const PROJECTS = {
  PAY: { id: '10000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' },
  WEB: { id: '10000000-0000-4000-8000-000000000002', key: 'WEB', name: 'Website' },
};

function task(key: string, status: TaskStatus, priority: TaskListItem['priority'], milestone?: string) {
  const [projectKey, number] = key.split('-') as [keyof typeof PROJECTS, string];
  return {
    id: `20000000-0000-4000-8000-${key.replace('-', '').padStart(12, '0')}`,
    key,
    number: Number(number),
    project: PROJECTS[projectKey],
    title: `Title of ${key}`,
    status,
    priority,
    assignee: null,
    milestone: milestone
      ? { id: '30000000-0000-4000-8000-000000000001', name: milestone, status: 'active', targetDate: null }
      : null,
    cycle: null,
    cycleAddedAt: null,
    rank: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  } satisfies TaskListItem;
}

const ME: Me = {
  user: {
    id: 'u1',
    name: 'Ana Ruiz',
    email: 'ana@example.com',
    kind: 'person',
    responsible: null,
    theme: 'system',
  },
  workspace: { id: 'w1', name: 'Reddevs', slug: 'reddevs' },
  role: 'admin',
  auth: { method: 'session', scope: null },
};

function project(ref: (typeof PROJECTS)[keyof typeof PROJECTS]): ProjectWithCounts {
  return {
    ...ref,
    description: null,
    usesMilestones: true,
    usesCycles: true,
    currentCycle: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    openCounts: { backlog: 0, todo: 0, in_progress: 0, in_review: 0 },
    openCount: 0,
    lastActivityAt: '2026-10-01T10:00:00.000Z',
    assignees: [],
  } as unknown as ProjectWithCounts;
}

function createFake(items: TaskListItem[]) {
  const state: FakeState = { items, failList: false, listCalls: [] };
  const asArray = (value: unknown) => (value == null ? undefined : Array.isArray(value) ? value : [value]);
  const client = {
    me: { get: async () => ME },
    projects: { list: async () => ({ items: [project(PROJECTS.PAY), project(PROJECTS.WEB)] }) },
    milestones: { list: async () => ({ items: [] }) },
    tasks: {
      list: async (input: Record<string, unknown>) => {
        state.listCalls.push(input);
        if (state.failList) throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
        const projects = asArray(input.project);
        const statuses = asArray(input.status);
        const scoped = state.items.filter((item) => !projects || projects.includes(item.project.key));
        const counts: StatusCounts = {
          backlog: 0,
          todo: 0,
          in_progress: 0,
          in_review: 0,
          done: 0,
          canceled: 0,
        };
        for (const item of scoped) counts[item.status] += 1;
        return {
          items: scoped.filter((item) => !statuses || statuses.includes(item.status)),
          nextCursor: null,
          counts,
        };
      },
    },
  };
  return { client, state };
}

function renderMyTasks(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } },
  });
  const root = createRootRoute({
    component: () => (
      <UIProvider>
        <Outlet />
      </UIProvider>
    ),
  });
  const myTasks = createRoute({
    getParentRoute: () => root,
    path: '/my-tasks',
    validateSearch: parseMyTasksSearch,
    component: function MyTasksRoute() {
      return <MyTasksScreen search={myTasks.useSearch()} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([myTasks]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

const groupRows = () =>
  screen
    .getAllByRole('row')
    .filter((element) => element.hasAttribute('data-group-row'))
    .map((element) => element.textContent);

const ITEMS = [
  task('PAY-139', 'in_progress', 'medium'),
  task('WEB-91', 'in_review', 'high'),
  task('WEB-88', 'todo', 'urgent'),
  task('PAY-152', 'todo', 'medium', 'Webhooks v2'),
  task('WEB-79', 'backlog', 'none'),
  task('PAY-100', 'done', 'high'),
];

beforeEach(() => {
  api.current = createFake(ITEMS);
});

describe('My tasks', () => {
  it('lists open tasks across projects, grouped by status and sorted by priority', async () => {
    renderMyTasks('/my-tasks');
    await screen.findByRole('row', { name: /WEB-88\b/ });
    expect(groupRows()).toEqual([
      'In progress1, expanded',
      'In review1, expanded',
      'Todo2, expanded',
      'Backlog1, expanded',
    ]);
    const todo = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    expect(todo.findIndex((text) => text.includes('WEB-88'))).toBeLessThan(
      todo.findIndex((text) => text.includes('PAY-152')),
    );
    expect(screen.queryByRole('row', { name: /PAY-100\b/ })).not.toBeInTheDocument();
    expect(screen.getByText('5 open across 2 projects in Reddevs')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /PAY-152\b/ });
    expect(within(row).getByText('Payments')).toBeInTheDocument();
    expect(within(row).getByText('Webhooks v2')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeInTheDocument();
    expect(api.current?.state.listCalls[0]).toMatchObject({
      assignee: 'me',
      status: ['in_progress', 'in_review', 'todo', 'backlog'],
    });
    expect(api.current?.state.listCalls[0]).not.toHaveProperty('project');
  });

  it('J opens the panel on the first task with its project, drops columns, and Esc closes it', async () => {
    const user = userEvent.setup();
    const { router } = renderMyTasks('/my-tasks');
    await screen.findByRole('row', { name: /WEB-88\b/ });
    await user.keyboard('j');
    expect(await screen.findByText('pane PAY PAY-139 with project')).toBeInTheDocument();
    await user.keyboard('j');
    expect(await screen.findByText('pane WEB WEB-91 with project')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ task: 'WEB-91' }));
    expect(screen.queryByRole('columnheader', { name: 'Project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Milestone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Milestone/ })).not.toBeInTheDocument();
    expect(screen.getByText('5 open across 2 projects')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(/^pane /)).not.toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeInTheDocument();
  });

  it('moves with the arrow keys over group rows and folds groups with Left and Right', async () => {
    // Order: PAY-139 (in progress), WEB-91 (in review), WEB-88, PAY-152 (todo), WEB-79 (backlog).
    const user = userEvent.setup();
    const { router } = renderMyTasks('/my-tasks');
    await screen.findByRole('row', { name: /WEB-88\b/ });
    const focused = (key: string) =>
      screen.getByRole('row', { name: new RegExp(`${key}\\b`) }).contains(document.activeElement);
    const group = (name: string) =>
      screen.getAllByRole('row').find((element) => element.textContent?.startsWith(name)) as HTMLElement;

    await user.keyboard('j');
    await waitFor(() => expect(focused('PAY-139')).toBe(true));
    await user.keyboard('{ArrowDown}'); // over the In review group row
    expect(focused('WEB-91')).toBe(true);
    await user.keyboard('{ArrowDown}');
    expect(focused('WEB-88')).toBe(true);
    expect(await screen.findByText('pane WEB WEB-88 with project')).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(group('Todo')).toHaveFocus();
    expect(group('Todo')).toHaveTextContent(/collapsed/);
    await user.keyboard('{ArrowDown}');
    expect(focused('WEB-79')).toBe(true);
    await user.keyboard('{ArrowUp}'); // over Backlog and the folded Todo group
    expect(focused('WEB-91')).toBe(true);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ task: 'WEB-91' }));

    // Down from the search field returns to the selected row.
    await user.click(screen.getByRole('searchbox', { name: 'Search your tasks' }));
    await user.keyboard('{ArrowDown}');
    expect(focused('WEB-91')).toBe(true);
  });

  it('opens the panel from ?task= for a task of any project', async () => {
    renderMyTasks('/my-tasks?task=WEB-79');
    expect(await screen.findByText('pane WEB WEB-79 with project')).toBeInTheDocument();
  });

  it('filters by project and status through the URL', async () => {
    const { router } = renderMyTasks('/my-tasks?project=PAY&status=done,todo');
    await screen.findByRole('row', { name: /PAY-100\b/ });
    expect(groupRows()).toEqual(['Todo1, expanded', 'Done1, expanded']);
    expect(api.current?.state.listCalls.at(-1)).toMatchObject({ project: ['PAY'], status: ['todo', 'done'] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await screen.findByRole('row', { name: /WEB-88\b/ });
  });

  it('shows the empty state without filters and a clear button with them', async () => {
    api.current = createFake([]);
    renderMyTasks('/my-tasks');
    expect(await screen.findByRole('heading', { name: 'Nothing assigned to you' })).toBeInTheDocument();
    expect(
      screen.getByText('Tasks assigned to you in any project of Reddevs show up here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse projects' })).toBeInTheDocument();
  });

  it('says when filters match nothing and clears them', async () => {
    const user = userEvent.setup();
    const { router } = renderMyTasks('/my-tasks?project=WEB&status=canceled');
    expect(await screen.findByText('No tasks match these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByRole('row', { name: /WEB-88\b/ })).toBeInTheDocument();
  });

  it('shows the error banner with Retry', async () => {
    const fake = createFake(ITEMS);
    fake.state.failList = true;
    api.current = fake;
    const user = userEvent.setup();
    renderMyTasks('/my-tasks');
    expect(
      await screen.findByText(/Couldn't load your tasks\. The server ran into an error\./),
    ).toBeInTheDocument();
    fake.state.failList = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('row', { name: /WEB-88\b/ })).toBeInTheDocument();
  });
});
