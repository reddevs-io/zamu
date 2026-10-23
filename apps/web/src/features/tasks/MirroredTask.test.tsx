import { ORPCError } from '@orpc/client';
import type { Activity, Task } from '@pm/contracts';
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
import { clearCommentDrafts } from '~/features/comments/CommentComposer';
import { resetTimelinePreferences } from '~/features/comments/TaskTimeline';
import { UIProvider } from '~/ui';
import { createFakeApi, FAKE_MILESTONES, FAKE_PEOPLE, type FakeApi } from './fake-api';
import { canonicalTaskPath } from './prefetch';
import { TaskDetailPane } from './TaskDetailPane';
import { TaskPage } from './TaskPage';

// Mirrored tasks (frames 5a to 5k): the panel and the page against the in-memory /api/v1 client.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({ current: null as FakeApi | null }));

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

const fake = () => api.current as FakeApi;
const FILE = 'backlog/tasks/back-1 - Retry-failed-webhook-deliveries.md';
const FILE_URL = 'https://gitlab.example.com/reddevs/payments/-/blob/main/backlog/tasks/back-1.md';
const DESCRIPTION = [
  'Deliveries that fail should retry with backoff.',
  '',
  '## Acceptance criteria',
  '',
  '- [x] #1 Retries follow 30s, 1m, 2m',
  '- [ ] #2 4xx stops retrying',
  '',
  '## Implementation notes',
  '',
  'pg-boss doubles the delay.',
].join('\n');

/** Turns PAY-1 into a task mirrored from BACK-1, with history from the Backlog.md actor. */
function mirrorPay1({ detached = false, hidden = false }: { detached?: boolean; hidden?: boolean } = {}) {
  const api = fake();
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const webhooks = api.milestones.find((item) => item.id === FAKE_MILESTONES.webhooks);
  if (webhooks) webhooks.backlogId = 'm-3';
  const task = api.tasks[0] as Task;
  const pay2 = api.tasks[1] as Task;
  Object.assign(task, {
    description: DESCRIPTION,
    milestone: webhooks
      ? { id: webhooks.id, name: webhooks.name, status: webhooks.status, targetDate: webhooks.targetDate }
      : null,
    locked: detached
      ? []
      : ['title', 'description', 'status', 'priority', 'assignee', 'milestone', 'createdAt'],
    hidden,
    hiddenAt: hidden ? at(60) : null,
    backlog: {
      id: 'BACK-1',
      file: hidden || detached ? null : FILE,
      fileUrl: hidden || detached ? null : FILE_URL,
      data: {
        kind: 'task',
        status: 'In Progress',
        priority: 'high',
        milestone: 'm-3',
        assignees: [
          { value: '@claude', user: FAKE_PEOPLE.claude },
          { value: '@tomas', user: FAKE_PEOPLE.tomas },
          { value: '@francis', user: null },
        ],
        reporter: '@ana',
        labels: ['webhooks', 'retries'],
        dependencies: [
          { id: 'BACK-2', task: { key: 'PAY-2', title: pay2.title, status: pay2.status, hidden: false } },
          { id: 'BACK-12', task: null },
        ],
        parent: null,
        subtasks: [{ id: 'BACK-1.1', task: null }],
        dueDate: '2026-11-14',
        type: 'feature',
        references: ['https://docs.stripe.com/webhooks#retries', 'src/webhooks/delivery.ts'],
        documentation: [],
        modifiedFiles: [],
        createdDate: '2026-10-02 09:14',
        updatedDate: null,
        ordinal: null,
        other: { estimate: 5 },
      },
    },
  } satisfies Partial<Task>);
  api.mirror.summary = {
    mode: 'mirror',
    state: detached ? 'detached' : 'healthy',
    defaultBranch: 'main',
    lastReadAt: at(3),
    lastReadCommit: 'e91b07fdeadbeef',
    lastTrigger: 'webhook',
    problems: { files: 0, values: 0 },
    hidden: hidden ? 1 : 0,
    detachedAt: detached ? at(1) : null,
  };
  api.mirror.history = [
    {
      id: '80000000-0000-4000-8000-000000000001',
      type: 'project.backlog_imported',
      actor: null,
      onBehalfOf: null,
      origin: 'backlog',
      originRef: 'a1b2c3d4e5f6',
      details: {
        mode: 'mirror',
        repository: 'gitlab.example.com/reddevs/payments',
        tasks: 412,
        milestones: 6,
      },
      createdAt: at(600),
    },
    ...(detached
      ? [
          {
            id: '80000000-0000-4000-8000-000000000002',
            type: 'project.backlog_detached' as const,
            actor: FAKE_PEOPLE.ana,
            onBehalfOf: null,
            origin: 'app' as const,
            originRef: null,
            details: { mode: 'mirror' as const, repository: null, tasks: null, milestones: null },
            createdAt: at(1),
          },
        ]
      : []),
  ];
  const backlogEntry = (minutesAgo: number, entry: Partial<Activity>): Activity => ({
    id: `90000000-0000-4000-8000-${String(minutesAgo).padStart(12, '0')}`,
    type: 'task.updated',
    taskKey: 'PAY-1',
    actor: null,
    onBehalfOf: null,
    changes: [],
    origin: 'backlog',
    originRef: null,
    backlogFields: [],
    createdAt: at(minutesAgo),
    ...entry,
  });
  api.activity.push(
    backlogEntry(120, {
      changes: [{ field: 'status', from: 'todo', to: 'in_progress' }],
      originRef: '3f2a1c9aaaaaaa',
    }),
    backlogEntry(40, { backlogFields: ['labels', 'updatedDate'], originRef: 'c4d81e2bbbbbbb' }),
  );
  if (hidden) api.activity.push(backlogEntry(60, { type: 'task.hidden', originRef: '77ab210ccccccc' }));
}

function renderApp(url: string) {
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
  const list = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/',
    component: function ListRoute() {
      const { projectKey } = list.useParams();
      const search = list.useSearch() as { task?: string };
      return (
        <section aria-label="Task detail" className="flex flex-col">
          <TaskDetailPane projectKey={projectKey} taskKey={search.task ?? 'PAY-1'} onClose={() => {}} />
        </section>
      );
    },
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/$taskKey',
    component: function PageRoute() {
      const { projectKey, taskKey } = page.useParams();
      return <TaskPage key={taskKey} projectKey={projectKey} taskKey={taskKey} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, page]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

const pane = () => screen.getByRole('region', { name: 'Task detail' });
const historyRegion = () => screen.getByRole('region', { name: 'Activity and comments' });
const cell = (id: string) => pane().querySelector(`[data-cell="${id}"]`) as HTMLElement;

beforeEach(() => {
  api.current = createFakeApi();
  clearCommentDrafts();
  resetTimelinePreferences();
});

describe('mirrored task in the panel', () => {
  it('shows the Backlog.md ID, the source strip and hatched owned fields', async () => {
    mirrorPay1();
    renderApp('/p/PAY');
    await screen.findByText('BACK-1', { selector: '[title="Backlog.md ID"]' });
    expect(within(pane()).getByText('Fields with a hatch come from')).toBeTruthy();
    expect(within(pane()).getByRole('link', { name: 'Open file' }).getAttribute('href')).toBe(FILE_URL);
    for (const id of ['status', 'priority', 'assignee', 'milestone', 'created']) {
      await waitFor(() => expect(cell(id)?.dataset.locked).toBe('true'));
      expect(within(cell(id)).getByText('· file')).toBeTruthy();
    }
    // Cycle stays editable and keeps its shortcut.
    expect(cell('cycle').dataset.locked).toBeUndefined();
    expect(within(cell('cycle')).getByRole('button', { name: /Cycle:/ })).toBeTruthy();
    // No pickers for owned fields, and the title is not editable.
    expect(within(pane()).queryByTitle('Edit title')).toBeNull();
    expect(within(cell('assignee')).getByText('+2 in Backlog.md')).toBeTruthy();
    expect(within(cell('milestone')).getByText('m-3')).toBeTruthy();
    expect(within(cell('created')).getByText('@ana')).toBeTruthy();
  });

  it('opens the owned-field note on click and on Shift+M; Shift+C still sets the cycle', async () => {
    mirrorPay1();
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await waitFor(() => expect(cell('status')?.dataset.locked).toBe('true'));
    await user.click(within(cell('status')).getByRole('button'));
    const note = await screen.findByRole('dialog', { name: 'Status comes from Backlog.md' });
    expect(within(note).getByText('backlog task edit 1 -s Done')).toBeTruthy();
    expect(within(note).getByText('status:')).toBeTruthy();
    expect(within(note).getByText('main')).toBeTruthy();
    expect(within(note).getByRole('button', { name: 'Copy path' })).toBeTruthy();
    expect(within(note).getByRole('link', { name: 'Open file' }).getAttribute('href')).toBe(FILE_URL);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.keyboard('{Shift>}M{/Shift}');
    const milestoneNote = await screen.findByRole('dialog', { name: 'Milestone comes from Backlog.md' });
    expect(within(milestoneNote).getByText(/^backlog task edit 1 -m /)).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.keyboard('{Shift>}C{/Shift}');
    expect(await screen.findByRole('searchbox', { name: /cycle/i })).toBeTruthy();
    expect(fake().calls.update).toEqual([]);
  });

  it('shows the description built from the sections, read-only', async () => {
    mirrorPay1();
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await screen.findByRole('region', { name: 'Task detail' });
    const fold = await within(pane()).findByRole('button', { name: /Description/ });
    expect(fold.textContent).toContain('3 sections from Backlog.md, 1 of 2 checklist items done');
    await user.click(fold);
    expect(fold.textContent).toContain('built from 3 Backlog.md sections');
    expect(within(pane()).getByText('#1 Retries follow 30s, 1m, 2m')).toBeTruthy();
    expect(within(pane()).getAllByRole('img', { name: 'Done' }).length).toBeGreaterThan(0);
    expect(within(pane()).queryByRole('checkbox')).toBeNull();
    expect(within(pane()).queryByText('Add a description. Markdown works.')).toBeNull();
  });

  it('lists the Backlog.md block: labels, also assigned, links and missing IDs', async () => {
    mirrorPay1();
    renderApp('/p/PAY');
    const block = await screen.findByRole('region', { name: 'Backlog.md BACK-1' });
    expect(within(block).getByText('read-only · fields this app doesn’t have')).toBeTruthy();
    expect(within(block).getByText('webhooks')).toBeTruthy();
    expect(within(block).getByText('is Tomás Berg')).toBeTruthy();
    expect(within(block).getByText('matches no member')).toBeTruthy();
    expect(within(block).getByRole('link', { name: /PAY-2/ }).getAttribute('href')).toBe('/p/PAY/PAY-2');
    expect(within(block).getAllByText('no task with this ID')).toHaveLength(2);
    expect(within(block).getByText('Nov 14, 2026 · feature')).toBeTruthy();
    expect(within(block).getByText('estimate: 5')).toBeTruthy();
  });

  it('shows Backlog.md history with commits and the first read', async () => {
    mirrorPay1();
    renderApp('/p/PAY');
    await screen.findByRole('region', { name: 'Activity and comments' });
    const imported = await within(historyRegion()).findByText(/imported the task with 411 others/);
    const importedLine = imported.closest('[data-activity]') as HTMLElement;
    expect(importedLine.dataset.origin).toBe('backlog');
    expect(within(importedLine).getByText('Backlog.md')).toBeTruthy();
    expect(within(importedLine).getByText('a1b2c3d')).toBeTruthy();
    const moved = within(historyRegion()).getByText(/moved it from Todo to In progress/);
    expect(within(moved.closest('[data-activity]') as HTMLElement).getByText('3f2a1c9')).toBeTruthy();
    expect(within(historyRegion()).getByText(/changed the labels/)).toBeTruthy();
    // The first read comes first.
    const lines = within(historyRegion()).getAllByText('Backlog.md');
    expect(lines[0]?.closest('[data-activity]')?.getAttribute('data-activity')).toBe(
      'project.backlog_imported',
    );
  });

  it('opens the note with the server hint when a write is refused with TASK_MIRRORED', async () => {
    mirrorPay1();
    // Stale data: the panel thinks nothing is locked.
    (fake().tasks[0] as Task).locked = [];
    fake().client.tasks.update = async () => {
      throw new ORPCError('TASK_MIRRORED', {
        status: 409,
        message: "PAY-1 is mirrored from Backlog.md, so its status can't change here",
        data: {
          field: 'status',
          file: FILE,
          backlogId: 'BACK-1',
          hint: 'backlog task edit 1 -s "In Review"',
        },
      });
    };
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await screen.findByRole('region', { name: 'Task detail' });
    const status = await within(pane()).findByRole('button', { name: /Status/ });
    await user.click(status);
    await user.click(await screen.findByRole('option', { name: /In review/ }));
    const note = await screen.findByRole('dialog', { name: 'Status comes from Backlog.md' });
    expect(within(note).getByText('backlog task edit 1 -s "In Review"')).toBeTruthy();
    expect(within(note).getByRole('alert').textContent).toContain("so its status can't change here");
    expect(screen.queryByText(/Couldn't save your change/)).toBeNull();
  });
});

describe('hidden and detached tasks', () => {
  it('shows the removed banner on a hidden task and keeps comments', async () => {
    mirrorPay1({ hidden: true });
    renderApp('/p/PAY');
    await screen.findByRole('region', { name: 'Task detail' });
    const banner = await within(pane()).findByRole('status');
    expect(banner.textContent).toContain('Removed from Backlog.md');
    await waitFor(() => expect(banner.textContent).toContain('(last seen at commit 77ab210)'));
    expect(within(pane()).queryByText('Fields with a hatch come from')).toBeNull();
    expect(await within(historyRegion()).findByText(/hid the task: its file is gone from main/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeTruthy();
  });

  it('unlocks every field after detach and keeps the block as a record', async () => {
    mirrorPay1({ detached: true });
    renderApp('/p/PAY');
    const block = await screen.findByRole('region', { name: 'Backlog.md BACK-1' });
    expect(within(block).getByText('kept from the import · read-only')).toBeTruthy();
    expect(within(pane()).getByText('Was mirrored from Backlog.md as')).toBeTruthy();
    expect(cell('status').dataset.locked).toBeUndefined();
    expect(within(pane()).getByTitle('Edit title')).toBeTruthy();
    expect(
      await within(historyRegion()).findByText(
        /detached Payments from Backlog.md. Every field is editable now./,
      ),
    ).toBeTruthy();
  });
});

describe('mirrored task on its page', () => {
  it('uses the same pieces in the page layout', async () => {
    mirrorPay1();
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await screen.findByText('BACK-1', { selector: '[title="Backlog.md ID"]' });
    expect(screen.getByText('Fields with a hatch come from')).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Backlog.md BACK-1' })).toBeTruthy();
    const properties = screen.getByRole('complementary', { name: 'Properties' });
    expect(within(properties).getAllByText('· file').length).toBe(5);
    const priorityRow = within(properties).getByText('Priority').closest('[data-locked]') as HTMLElement;
    await user.click(within(priorityRow).getByRole('button'));
    const note = await screen.findByRole('dialog', { name: 'Priority comes from Backlog.md' });
    expect(within(note).getByText(/^backlog task edit 1 --priority /)).toBeTruthy();
  });
});

describe('canonicalTaskPath', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it('keeps task keys of the project, upper-cased, without asking the server', async () => {
    const get = vi.spyOn(fake().client.tasks, 'get');
    expect(await canonicalTaskPath(client(), 'pay', 'pay-1')).toEqual({
      projectKey: 'PAY',
      taskKey: 'PAY-1',
    });
    expect(await canonicalTaskPath(client(), 'PAY', 'PAY-786.1')).toEqual({
      projectKey: 'PAY',
      taskKey: 'PAY-786.1',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('resolves a Backlog.md ID to the task key', async () => {
    fake().client.tasks.get = async (input: Record<string, unknown>) => {
      expect(input).toEqual({ key: 'BACK-007', project: 'PAY' });
      return { ...(fake().tasks[0] as Task), key: 'PAY-7' };
    };
    expect(await canonicalTaskPath(client(), 'PAY', 'back-007')).toEqual({
      projectKey: 'PAY',
      taskKey: 'PAY-7',
    });
  });

  it('returns null for keys that match nothing', async () => {
    expect(await canonicalTaskPath(client(), 'PAY', 'not a key')).toBeNull();
    expect(await canonicalTaskPath(client(), 'PAY', 'BACK-9999')).toBeNull();
  });
});
