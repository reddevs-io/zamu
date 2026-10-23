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
import { PageSearchProvider } from '~/features/shell/page-search';
import { QuickCreateProvider, useQuickCreate } from '~/features/shell/quick-create';
import { parseTaskListSearch } from '~/features/tasks/search';
import { UIProvider } from '~/ui';
import { BoardScreen } from './BoardScreen';
import { createFakeBoardApi, type FakeBoardApi } from './fake-board-api';

// Component tests of the board against an in-memory /api/v1 client inside a real TanStack router:
// keyboard moves, undo, and the rollback when someone else changed the task.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({ current: null as FakeBoardApi | null }));

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

// The task panel is another workstream's; the board only needs it to open and close.
vi.mock('~/features/tasks/TaskDetailPane', () => ({
  TaskDetailPane: ({ taskKey, onClose }: { taskKey: string; onClose: () => void }) => (
    <div>
      <h2>Panel {taskKey}</h2>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
  RequestHint: ({ requestId }: { requestId: string }) => <p>{requestId}</p>,
}));

/** Stands in for the quick create dialog: shows what the board opened it with. */
function QuickCreateProbe() {
  const { isOpen, projectKey, status } = useQuickCreate();
  return (
    <output aria-label="Quick create">{isOpen ? `${projectKey} ${status ?? 'default'}` : 'closed'}</output>
  );
}

function renderBoard(url = '/p/PAY?view=board', { quickCreate = false }: { quickCreate?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const root = createRootRoute({
    component: () => (
      <UIProvider>
        <PageSearchProvider>
          {quickCreate ? (
            <QuickCreateProvider>
              <Outlet />
              <QuickCreateProbe />
            </QuickCreateProvider>
          ) : (
            <Outlet />
          )}
        </PageSearchProvider>
      </UIProvider>
    ),
  });
  const board = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/',
    validateSearch: parseTaskListSearch,
    component: function BoardRoute() {
      const { projectKey } = board.useParams();
      return <BoardScreen projectKey={projectKey} search={board.useSearch()} />;
    },
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/$taskKey',
    component: () => <p>Task page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([board, page]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

const column = (name: RegExp | string) => screen.getByRole('region', { name });
const keysIn = (name: RegExp) =>
  [...column(name).querySelectorAll('[data-card-key]')].map((card) => card.getAttribute('data-card-key'));
const focusedKey = () => document.activeElement?.closest('[data-card-key]')?.getAttribute('data-card-key');

beforeEach(() => {
  api.current = createFakeBoardApi();
});

describe('board', () => {
  it('shows a column per status with Done and Canceled folded', async () => {
    renderBoard();
    await screen.findByText('Card 4');
    expect(keysIn(/^Backlog, 1 tasks$/)).toEqual(['PAY-1']);
    expect(keysIn(/^Todo, 2 tasks$/)).toEqual(['PAY-2', 'PAY-3']);
    expect(keysIn(/^In progress, 2 tasks$/)).toEqual(['PAY-4', 'PAY-5']);
    expect(screen.getByRole('button', { name: 'Expand Done, 1 tasks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Canceled, 0 tasks' })).toBeInTheDocument();
    // Only open columns load.
    const statuses = api.current?.calls.list.map((input) => (input.status as string[])[0]);
    expect(statuses).not.toContain('done');
  });

  it('moves the focus with H/J/K/L and opens the panel with Enter', async () => {
    const user = userEvent.setup();
    const { router } = renderBoard();
    await screen.findByText('Card 4');

    await user.keyboard('j');
    await waitFor(() => expect(focusedKey()).toBe('PAY-1'));
    await user.keyboard('l');
    await waitFor(() => expect(focusedKey()).toBe('PAY-2'));
    await user.keyboard('j');
    await waitFor(() => expect(focusedKey()).toBe('PAY-3'));
    await user.keyboard('l');
    await waitFor(() => expect(focusedKey()).toBe('PAY-5'));
    await user.keyboard('k');
    await waitFor(() => expect(focusedKey()).toBe('PAY-4'));

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Panel PAY-4' })).toBeInTheDocument();
    await waitFor(() => expect((router.state.location.search as { task?: string }).task).toBe('PAY-4'));
    // With the panel open, Backlog folds.
    expect(screen.getByRole('button', { name: 'Expand Backlog, 1 tasks' })).toBeInTheDocument();
    // Esc closes it.
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Panel PAY-4' })).not.toBeInTheDocument(),
    );
  });

  it('changes status with Shift+L in one PATCH and undoes it with Ctrl+Z', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Card 4');
    await user.keyboard('j');
    await user.keyboard('l');
    await waitFor(() => expect(focusedKey()).toBe('PAY-2'));

    await user.keyboard('{Shift>}L{/Shift}');
    // The board changes at once.
    expect(keysIn(/^In progress/)).toEqual(['PAY-2', 'PAY-4', 'PAY-5']);
    expect(keysIn(/^Todo/)).toEqual(['PAY-3']);
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('PAY-2 moved to In progress, position 1 of 3');
    await waitFor(() => expect(api.current?.calls.update).toHaveLength(1));
    const [first] = api.current?.calls.update ?? [];
    expect(first).toEqual({
      key: 'PAY-2',
      status: 'in_progress',
      ifUpdatedAt: '2026-10-20T10:00:02.000Z',
    });
    await waitFor(() => expect(focusedKey()).toBe('PAY-2'));
    await waitFor(() =>
      expect(api.current?.tasks.find((task) => task.key === 'PAY-2')?.status).toBe('in_progress'),
    );

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(api.current?.calls.update).toHaveLength(2));
    const second = api.current?.calls.update[1];
    expect(second).toMatchObject({ key: 'PAY-2', status: 'todo', position: { before: 'PAY-3' } });
    // The undo sends the updatedAt the first move returned.
    expect(second?.ifUpdatedAt).not.toBe(first?.ifUpdatedAt);
    await waitFor(() => expect(keysIn(/^Todo/)).toEqual(['PAY-2', 'PAY-3']));
    expect(await screen.findByText('PAY-2 moved back to Todo')).toBeInTheDocument();
    await waitFor(() => expect(api.current?.tasks.find((task) => task.key === 'PAY-2')?.status).toBe('todo'));
  });

  it('reorders inside a column with Shift+J and Shift+K', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Card 4');
    await user.keyboard('jll');
    await waitFor(() => expect(focusedKey()).toBe('PAY-4'));

    await user.keyboard('{Shift>}J{/Shift}');
    expect(keysIn(/^In progress/)).toEqual(['PAY-5', 'PAY-4']);
    await waitFor(() => expect(api.current?.calls.update).toHaveLength(1));
    expect(api.current?.calls.update[0]).toMatchObject({ key: 'PAY-4', position: { after: 'PAY-5' } });
    expect(api.current?.calls.update[0]).not.toHaveProperty('status');

    // At the bottom of the column Shift+J does nothing; Shift+K moves it back up.
    await waitFor(() => expect(focusedKey()).toBe('PAY-4'));
    await user.keyboard('{Shift>}J{/Shift}');
    await user.keyboard('{Shift>}K{/Shift}');
    await waitFor(() => expect(api.current?.calls.update).toHaveLength(2));
    expect(api.current?.calls.update[1]).toMatchObject({ key: 'PAY-4', position: { before: 'PAY-5' } });
    await waitFor(() => expect(keysIn(/^In progress/)).toEqual(['PAY-4', 'PAY-5']));
  });

  it('rolls the card back and explains when someone else changed the task', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Card 4');
    await user.keyboard('jll');
    await waitFor(() => expect(focusedKey()).toBe('PAY-4'));

    // Meanwhile someone moved PAY-4 to In review.
    if (api.current) api.current.control.changedBehindYourBack = { key: 'PAY-4', status: 'in_review' };
    await user.keyboard('{Shift>}H{/Shift}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't move PAY-4 to Todo. It went back to In review.");
    expect(
      screen.getByText(
        'Someone else changed the task while you moved it. The board shows the latest version.',
      ),
    ).toBeInTheDocument();
    // The card shows where the server has it.
    await waitFor(() => expect(keysIn(/^Todo/)).toEqual(['PAY-2', 'PAY-3']));
    await waitFor(() => expect(keysIn(/^In review/)).toContain('PAY-4'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // Try again sends the move with the current updatedAt and works.
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.current?.calls.update).toHaveLength(2));
    await waitFor(() => expect(keysIn(/^Todo/)).toEqual(['PAY-4', 'PAY-2', 'PAY-3']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(api.current?.tasks.find((task) => task.key === 'PAY-4')?.status).toBe('todo'));
  });

  it('opens a folded column when a card moves into it', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Card 4');
    await user.keyboard('jlll');
    await waitFor(() => expect(focusedKey()).toBe('PAY-6'));
    await user.keyboard('{Shift>}L{/Shift}');
    expect(await screen.findByRole('region', { name: /^Done, 2 tasks$/ })).toBeInTheDocument();
    await waitFor(() => expect(keysIn(/^Done/)).toContain('PAY-6'));
  });

  it('loads 50 cards per column and the next page when J passes the last one', async () => {
    api.current = createFakeBoardApi({ layout: { todo: 52 } });
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Card 50');
    expect(screen.queryByText('Card 51')).not.toBeInTheDocument();
    expect(screen.getByText('2 more · scroll or press J')).toBeInTheDocument();

    (document.querySelector('[data-card-key="PAY-50"]') as HTMLElement).focus();
    await user.keyboard('j');
    await waitFor(() => expect(focusedKey()).toBe('PAY-51'));
    expect(screen.queryByText(/more · scroll or press J/)).not.toBeInTheDocument();
  });

  it('groups cards into swimlanes by assignee', async () => {
    renderBoard('/p/PAY?view=board&lanes=assignee');
    await screen.findByText('Card 4');
    const lanes = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((name) => name && /tasks$/.test(name) && !/^(Backlog|Todo|In progress|In review)/.test(name));
    expect(lanes).toEqual(['claude-dev, 2 tasks', 'Tomás Berg, 2 tasks', 'No assignee, 2 tasks']);
    expect(screen.getByRole('grid', { name: 'In progress, No assignee' })).toBeInTheDocument();
  });

  it("opens quick create with the column's status from its +", async () => {
    const user = userEvent.setup();
    renderBoard('/p/PAY?view=board', { quickCreate: true });
    await screen.findByText('Card 4');
    const probe = screen.getByRole('status', { name: 'Quick create' });
    expect(probe).toHaveTextContent('closed');

    await user.click(screen.getByRole('button', { name: 'New task in In progress' }));
    expect(probe).toHaveTextContent('PAY in_progress');

    // The header's New opens it without a status.
    await user.click(screen.getByRole('button', { name: /^New(?! task in)/ }));
    expect(probe).toHaveTextContent('PAY default');
  });

  it('shows the empty state with the filters in words', async () => {
    renderBoard('/p/PAY?view=board&assignee=agents&cycle=12');
    expect(await screen.findByRole('heading', { name: 'No tasks match these filters' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cycle 12 has no tasks assigned to agents. Clear the filters, or add tasks to the cycle from the list.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/filtered: Cycle 12, assigned to agents/)).toBeInTheDocument();
  });
});
