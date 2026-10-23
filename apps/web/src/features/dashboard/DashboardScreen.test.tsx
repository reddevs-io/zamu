import { ORPCError } from '@orpc/client';
import type {
  Dashboard,
  DashboardScope,
  DeadlineItem,
  Me,
  Member,
  MentionItem,
  ReviewItem,
  StalledItem,
  UserRef,
} from '@pm/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateProvider, useQuickCreate } from '~/features/shell/quick-create';
import { QuickCreateDialog } from '~/features/tasks/QuickCreateDialog';
import { UIProvider } from '~/ui';
import { DashboardScreen } from './DashboardScreen';
import { parseDashboardSearch } from './search';

// The dashboard against an in-memory /api/v1 client inside a real TanStack router, so scope, the open
// group and the panel go through the URL. The task panel is a stub: its own tests live with the task screens.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

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
    revealNewestComment?: boolean;
    onClose: () => void;
  }) => (
    <div>
      <span>
        pane {props.projectKey} {props.taskKey} {props.revealNewestComment ? 'at newest comment' : 'at top'}
      </span>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  ),
  RequestHint: () => null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const ANA: UserRef = { id: '00000000-0000-4000-8000-000000000001', name: 'Ana Ruiz', kind: 'person' };
const TOMAS: UserRef = { id: '00000000-0000-4000-8000-000000000002', name: 'Tomás Berg', kind: 'person' };
const CLAUDE = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'claude-dev',
  kind: 'agent' as const,
  responsible: ANA,
};
const person = (user: UserRef) => ({ ...user, responsible: null });

const PROJECTS = { PAY: 'Payments', WEB: 'Website', INF: 'Infrastructure' } as const;

function task(key: string, title: string, status: 'in_review' | 'in_progress' | 'todo' = 'in_review') {
  const projectKey = key.split('-')[0] as keyof typeof PROJECTS;
  return {
    key,
    title,
    status,
    priority: 'high' as const,
    project: { key: projectKey, name: PROJECTS[projectKey] },
  };
}

const reviewItem = (key: string, title: string, assignee: ReviewItem['assignee'] = CLAUDE): ReviewItem => ({
  task: task(key, title),
  assignee,
  since: ago(3 * HOUR + MIN),
});

const mentionItem = (
  key: string,
  title: string,
  author: UserRef,
  mentioned: UserRef,
  excerpt: string,
): MentionItem => ({
  task: task(key, title, 'in_progress'),
  comment: {
    id: `0000000${key.length}-0000-4000-8000-00000000000${key.length}`,
    excerpt,
    createdAt: ago(25 * MIN),
  },
  author,
  onBehalfOf: author.kind === 'agent' ? ANA : null,
  mentioned: person(mentioned),
});

const stalledItem = (key: string, title: string): StalledItem => ({
  task: task(key, title, 'in_progress'),
  assignee: CLAUDE,
  lastTouchedAt: ago(26 * HOUR + MIN),
  thresholdHours: 24,
});

const MILESTONE_ID = '30000000-0000-4000-8000-000000000001';
const DEADLINES: DeadlineItem[] = [
  {
    kind: 'milestone',
    project: { key: 'PAY', name: 'Payments' },
    milestone: { id: MILESTONE_ID, name: 'PCI audit', targetDate: '2026-10-12' },
    daysOverdue: 11,
    openTasks: 4,
    progress: { done: 7, total: 11 },
  },
  {
    kind: 'cycle',
    project: { key: 'WEB', name: 'Website' },
    cycle: { number: 4, name: null, startsOn: '2026-10-12', endsOn: '2026-10-24' },
    daysLeft: 2,
    openTasks: 7,
    progress: { done: 12, total: 19 },
  },
];

const group = <T,>(items: T[], total = items.length) => ({ total, items });

function dashboard(scope: DashboardScope, overrides: Partial<Dashboard['groups']> = {}): Dashboard {
  return {
    scope,
    generatedAt: new Date().toISOString(),
    groups: {
      review: group([
        reviewItem('PAY-140', 'Retry failed webhook deliveries'),
        reviewItem('CLI-21', 'pm dashboard command'),
        reviewItem('WEB-91', 'Cookie banner blocks checkout', person(ANA)),
      ]),
      mentions: group([
        mentionItem(
          'PAY-140',
          'Retry failed webhook deliveries',
          CLAUDE,
          ANA,
          '@Ana Ruiz cap at `24h` or drop?',
        ),
        mentionItem('INF-31', 'Move Postgres backups', TOMAS, ANA, '@Ana Ruiz check the bucket policy'),
      ]),
      stalled: group([stalledItem('PAY-139', 'Stream invoice PDFs')]),
      deadlines: group(DEADLINES),
      ...overrides,
    },
    projects: [
      {
        key: 'PAY',
        name: 'Payments',
        openCounts: { backlog: 1, todo: 10, in_progress: 4, in_review: 3 },
        openCount: 18,
        usesMilestones: true,
        usesCycles: false,
        lastActivityAt: ago(5 * MIN),
        currentCycle: null,
        nextMilestone: {
          id: MILESTONE_ID,
          name: 'PCI audit',
          targetDate: '2026-10-12',
          overdue: true,
          done: 7,
          total: 11,
          others: 0,
        },
      },
      {
        key: 'INF',
        name: 'Infrastructure',
        openCounts: { backlog: 0, todo: 4, in_progress: 1, in_review: 0 },
        openCount: 5,
        usesMilestones: false,
        usesCycles: false,
        lastActivityAt: ago(HOUR),
        currentCycle: null,
        nextMilestone: null,
      },
    ],
    agents: [
      {
        agent: CLAUDE,
        currentTask: task('PAY-139', 'Stream invoice PDFs', 'in_progress'),
        inProgressCount: 5,
        stalled: true,
        lastActivityAt: ago(40 * MIN + 40_000),
      },
    ],
  };
}

const ME: Me = {
  user: {
    id: ANA.id,
    name: ANA.name,
    email: 'ana@example.com',
    kind: 'person',
    responsible: null,
    theme: 'system',
  },
  workspace: { id: 'w1', name: 'Reddevs', slug: 'reddevs' },
  role: 'admin',
  auth: { method: 'session', scope: null },
};

const member = (user: UserRef, responsible: UserRef | null = null) =>
  ({
    ...user,
    email: null,
    role: 'member',
    responsible,
    lastActiveAt: null,
    apiKeyCount: 0,
    joinedAt: ago(0),
  }) as Member;

interface FakeState {
  answers: Record<DashboardScope, Dashboard>;
  fail: boolean;
  calls: DashboardScope[];
  updates: unknown[];
}

function createFake(answers: Partial<Record<DashboardScope, Dashboard>> = {}) {
  const state: FakeState = {
    answers: { mine: answers.mine ?? dashboard('mine'), everyone: answers.everyone ?? dashboard('everyone') },
    fail: false,
    calls: [],
    updates: [],
  };
  const client = {
    me: { get: async () => ME },
    projects: {
      list: async () => ({
        items: [
          { key: 'PAY', name: 'Payments', usesMilestones: false, usesCycles: false },
          { key: 'WEB', name: 'Website', usesMilestones: false, usesCycles: false },
        ],
      }),
    },
    members: { list: async () => ({ items: [member(ANA), member(TOMAS), member(CLAUDE, ANA)] }) },
    dashboard: {
      get: async (input: { scope: DashboardScope }) => {
        state.calls.push(input.scope);
        if (state.fail) throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
        return state.answers[input.scope];
      },
    },
    tasks: {
      update: async (input: unknown) => {
        state.updates.push(input);
        throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
      },
      get: async () => {
        throw new ORPCError('NOT_FOUND', { status: 404 });
      },
      list: async () => ({ items: [], nextCursor: null }),
    },
  };
  return { client, state };
}

function QuickCreateProbe() {
  const quickCreate = useQuickCreate();
  return (
    <output aria-label="quick create">
      {quickCreate.isOpen ? `open:${quickCreate.projectKey ?? 'none'}:${quickCreate.pickProject}` : 'closed'}
    </output>
  );
}

function renderDashboard(url = '/dashboard') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } },
  });
  const root = createRootRoute({
    component: () => (
      <UIProvider>
        <QuickCreateProvider>
          <Outlet />
          <QuickCreateProbe />
          <QuickCreateDialog />
        </QuickCreateProvider>
      </UIProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/dashboard',
    validateSearch: parseDashboardSearch,
    component: function DashboardRoute() {
      return <DashboardScreen search={page.useSearch()} />;
    },
  });
  const milestone = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/milestones/$milestoneId',
    component: () => <p>milestone page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([page, milestone]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

const rowIds = (groupId: string) =>
  [
    ...document.querySelectorAll(
      `[data-queue-group="${groupId}"] [data-row-id]:not([data-row-id^="header:"])`,
    ),
  ].map((element) => element.getAttribute('data-row-id'));
const focusedRowId = () => document.activeElement?.getAttribute('data-row-id') ?? null;

beforeEach(() => {
  api.current = createFake();
});

describe('Dashboard', () => {
  it('shows the four groups in order with their rows, then projects and agents', async () => {
    renderDashboard();
    expect(
      await screen.findByRole('button', { name: /PAY-140 Retry failed webhook deliveries, in review/ }),
    ).toBeInTheDocument();
    const queue = screen.getByRole('region', { name: 'Needs you' });
    expect(within(queue).getByText('8')).toBeInTheDocument();
    expect(
      within(queue).getByText(
        'Assigned to you, your agents, and mentions of you. Items leave when they are handled.',
      ),
    ).toBeInTheDocument();
    expect(
      within(queue)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['In review', 'Mentions', 'Stalled', 'Deadlines']);
    expect(screen.getByText('Reddevs · you and 1 agent')).toBeInTheDocument();
    // Task row: who with "for", reason. Mention row: author, kind, inline code. Stalled pill. Deadline pills.
    const review = screen.getByRole('button', { name: /^PAY-140 .*in review$/ });
    expect(within(review).getByText('for Ana Ruiz')).toBeInTheDocument();
    expect(within(review).getByText('in review 3h')).toBeInTheDocument();
    const mention = screen.getByRole('button', { name: /^claude-dev on PAY-140/ });
    expect(within(mention).getByText('Agent asks')).toBeInTheDocument();
    expect(within(mention).getByText('24h').tagName).toBe('CODE');
    expect(within(mention).getByText('@Ana Ruiz')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /^Tomás Berg on INF-31/ })).getByText('Person asks'),
    ).toBeInTheDocument();
    expect(screen.getByText('no update 26h')).toBeInTheDocument();
    expect(screen.getByText('11 days overdue')).toBeInTheDocument();
    expect(screen.getByText('ends tomorrow')).toBeInTheDocument();
    expect(screen.getByText('milestone · target Oct 12')).toBeInTheDocument();
    expect(screen.getByText('4 open tasks')).toBeInTheDocument();
    // Projects and agents.
    expect(screen.getByRole('link', { name: 'PAY Payments, 18 open' })).toHaveAttribute('href', '/p/PAY');
    expect(screen.getByText('11d overdue')).toBeInTheDocument();
    expect(screen.getAllByText('Cycles not used')).toHaveLength(2);
    expect(screen.getByText('Milestones not used')).toBeInTheDocument();
    expect(screen.getByText('Stalled 26h')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
    expect(screen.getByText('Last activity 40m ago')).toBeInTheDocument();
    expect(screen.getByText('Yours · Everyone shows all 1')).toBeInTheDocument();
  });

  it('E switches to Everyone through the URL and shows who was asked', async () => {
    const user = userEvent.setup();
    const { router } = renderDashboard();
    await screen.findByRole('region', { name: 'Needs you' });
    await user.keyboard('e');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ scope: 'everyone' }));
    const queue = await screen.findByRole('region', { name: 'Needs someone' });
    expect(
      within(queue).getByText('Everyone in Reddevs. Items leave when they are handled.'),
    ).toBeInTheDocument();
    expect(within(queue).getAllByText('→').length).toBeGreaterThan(0);
    expect(screen.getByText('Reddevs · 2 people, 1 agent')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Agents' })).getByText('Everyone')).toBeInTheDocument();
    expect(api.current?.state.calls).toContain('everyone');
    await user.click(screen.getByRole('radio', { name: 'Mine' }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('scope'));
    expect(await screen.findByRole('region', { name: 'Needs you' })).toBeInTheDocument();
  });

  it('J and K move focus across groups; 1 to 4 jump to a group, or its header when empty', async () => {
    api.current = createFake({ mine: dashboard('mine', { mentions: group([]) }) });
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('button', { name: /^PAY-140 / });
    await user.keyboard('j');
    await waitFor(() => expect(focusedRowId()).toBe('review:PAY-140'));
    await user.keyboard('jjj');
    await waitFor(() => expect(focusedRowId()).toBe('stalled:PAY-139'));
    await user.keyboard('j');
    await waitFor(() => expect(focusedRowId()).toBe(`deadlines:milestone:${MILESTONE_ID}`));
    await user.keyboard('kk');
    await waitFor(() => expect(focusedRowId()).toBe('review:WEB-91'));
    await user.keyboard('4');
    await waitFor(() => expect(focusedRowId()).toBe(`deadlines:milestone:${MILESTONE_ID}`));
    await user.keyboard('2');
    await waitFor(() => expect(focusedRowId()).toBe('header:mentions'));
    expect(screen.getByText('No open questions')).toBeInTheDocument();
    await user.keyboard('j');
    await waitFor(() => expect(focusedRowId()).toBe('stalled:PAY-139'));
    await user.keyboard('1');
    await waitFor(() => expect(focusedRowId()).toBe('review:PAY-140'));
  });

  it('A shows all of the focused group with the footer, and collapses it again', async () => {
    const items = Array.from({ length: 7 }, (_, index) => reviewItem(`PAY-${200 + index}`, `Task ${index}`));
    api.current = createFake({ mine: dashboard('mine', { review: group(items, 132) }) });
    const user = userEvent.setup();
    const { router } = renderDashboard();
    await screen.findByRole('button', { name: /^PAY-200 / });
    expect(rowIds('review')).toHaveLength(5);
    expect(screen.getByText('Show all 50 of 132')).toBeInTheDocument();
    await user.keyboard('1');
    await user.keyboard('a');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ open: 'review' }));
    await waitFor(() => expect(rowIds('review')).toHaveLength(7));
    expect(screen.getByText('Showing 7 of 132. The rest stay here until they clear.')).toBeInTheDocument();
    await user.keyboard('a');
    await waitFor(() => expect(rowIds('review')).toHaveLength(5));
    expect(router.state.location.search).not.toHaveProperty('open');
  });

  it('keeps a focused row that a refresh cleared, faded, until focus moves', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderDashboard();
    await screen.findByRole('button', { name: /^CLI-21 / });
    await user.keyboard('jj');
    await waitFor(() => expect(focusedRowId()).toBe('review:CLI-21'));
    const fake = api.current as { state: FakeState };
    const answer = dashboard('mine');
    answer.groups.review = group(answer.groups.review.items.filter((item) => item.task.key !== 'CLI-21'));
    fake.state.answers.mine = answer;
    await act(() => queryClient.invalidateQueries());
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Needs you' })).toHaveTextContent(/Needs you\s*7/),
    );
    expect(rowIds('review')).toEqual(['review:PAY-140', 'review:CLI-21', 'review:WEB-91']);
    const kept = screen.getByRole('button', { name: /^CLI-21 / });
    expect(kept).toHaveAttribute('data-gone');
    expect(focusedRowId()).toBe('review:CLI-21');
    await user.keyboard('j');
    await waitFor(() => expect(rowIds('review')).toEqual(['review:PAY-140', 'review:WEB-91']));
    await waitFor(() => expect(focusedRowId()).toBe('review:WEB-91'));
  });

  it('Enter opens a task in the panel, a mention at its newest comment; Esc closes and returns focus', async () => {
    const user = userEvent.setup();
    const { router } = renderDashboard();
    await screen.findByRole('button', { name: /^PAY-140 / });
    await user.keyboard('j{Enter}');
    expect(await screen.findByText('pane PAY PAY-140 at top')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ task: 'PAY-140' }));
    expect(screen.getByRole('button', { name: /^PAY-140 .*in review$/ })).toHaveAttribute('data-selected');
    // With the panel open the rows drop the project, who and priority columns.
    expect(screen.queryByText('Agent asks')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(/^pane /)).not.toBeInTheDocument());
    await waitFor(() => expect(focusedRowId()).toBe('review:PAY-140'));
    await user.keyboard('2{Enter}');
    expect(await screen.findByText('pane PAY PAY-140 at newest comment')).toBeInTheDocument();
  });

  it('Enter on a deadline opens the milestone page', async () => {
    const user = userEvent.setup();
    const { router } = renderDashboard();
    await screen.findByRole('link', { name: /PCI audit, 11 days overdue/ });
    await user.keyboard('4{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/PAY/milestones/${MILESTONE_ID}`));
  });

  it('I assigns the focused task to me', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('button', { name: /^WEB-91 / });
    await user.keyboard('jjj');
    await waitFor(() => expect(focusedRowId()).toBe('review:WEB-91'));
    await user.keyboard('i');
    await waitFor(() => expect(api.current?.state.updates).toEqual([{ key: 'WEB-91', assignee: ANA.id }]));
  });

  it('search narrows the queue rows and project rows', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('button', { name: /^PAY-140 / });
    await user.type(screen.getByRole('searchbox', { name: 'Search the dashboard' }), 'cookie');
    await waitFor(() => expect(rowIds('review')).toEqual(['review:WEB-91']));
    expect(rowIds('mentions')).toEqual([]);
    expect(screen.queryByRole('link', { name: /^PAY Payments/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search the dashboard' }));
    await waitFor(() => expect(rowIds('review')).toHaveLength(3));
  });

  it('shows one all-clear line when nothing needs you', async () => {
    api.current = createFake({
      mine: dashboard('mine', {
        review: group([]),
        mentions: group([]),
        stalled: group([]),
        deadlines: group([]),
      }),
    });
    renderDashboard();
    expect(await screen.findByText('Nothing needs you right now')).toBeInTheDocument();
    expect(
      screen.getByText(/Reviews, mentions, stalled work and deadlines for you and your agents land here\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'In review' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PAY Payments/ })).toBeInTheDocument();
  });

  it('shows the new-workspace steps without projects', async () => {
    const empty = dashboard('mine', {
      review: group([]),
      mentions: group([]),
      stalled: group([]),
      deadlines: group([]),
    });
    api.current = createFake({ mine: { ...empty, projects: [], agents: [] } });
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Nothing to show yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New project/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add an agent' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Mine' })).not.toBeInTheDocument();
  });

  it('shows the error banner with Retry when the first load fails', async () => {
    const fake = createFake();
    fake.state.fail = true;
    api.current = fake;
    const user = userEvent.setup();
    renderDashboard();
    expect(
      await screen.findByText(/Couldn't load the dashboard\. The server ran into an error\./),
    ).toBeInTheDocument();
    fake.state.fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Needs you' })).toBeInTheDocument();
  });

  it('says when a background refresh failed and keeps the data', async () => {
    const { queryClient } = renderDashboard();
    await screen.findByRole('button', { name: /^PAY-140 / });
    (api.current as { state: FakeState }).state.fail = true;
    await act(() => queryClient.invalidateQueries());
    expect(await screen.findByText(/Couldn't refresh · showing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^PAY-140 / })).toBeInTheDocument();
  });

  it('New opens quick create with no project chosen and the project picker focused', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('region', { name: 'Needs you' });
    await user.click(screen.getByRole('button', { name: /^New/ }));
    expect(screen.getByLabelText('quick create')).toHaveTextContent('open:none:true');
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    const picker = within(dialog)
      .getAllByRole('button')
      .find((button) => button.textContent === 'Project');
    expect(picker).toBeDefined();
    await waitFor(() => expect(picker).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: /Create task/ })).toBeDisabled();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: /Website/ }));
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: /Create task/ })).toBeEnabled();
  });
});
