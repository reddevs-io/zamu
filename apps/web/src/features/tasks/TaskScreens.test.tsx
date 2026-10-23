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
import { PageSearchProvider, useFocusPageSearch } from '~/features/shell/page-search';
import { QuickCreateProvider, useQuickCreate } from '~/features/shell/quick-create';
import { UIProvider, useHotkeys } from '~/ui';
import { createFakeApi, type FakeApi } from './fake-api';
import { QuickCreateDialog } from './QuickCreateDialog';
import { parseTaskListSearch } from './search';
import { TaskListScreen } from './TaskListScreen';
import { TaskPage } from './TaskPage';

// Component tests of the task screens against an in-memory /api/v1 client, inside a real TanStack
// router (memory history), so selection and filters really go through the URL.

// The screens make several requests per render; give them time on a busy machine.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({ current: null as FakeApi | null }));

vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  // Forwards every call to the current test's fake, so each test gets fresh data.
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

/** The shell binds / to the page search; the tests stand in for it. */
function SlashFocusesSearch() {
  const focus = useFocusPageSearch();
  useHotkeys({ '/': () => focus() });
  return null;
}

/** Opens quick create the way the board column's "+" does. */
function OpenInReview() {
  const quickCreate = useQuickCreate();
  return (
    <button type="button" onClick={() => quickCreate.open('PAY', { status: 'in_review' })}>
      Open in review
    </button>
  );
}

/** `guardMs` delays every navigation, like the signed-in layout's server-side session check. */
function renderApp(url: string, { guardMs = 0 }: { guardMs?: number } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } },
  });
  const root = createRootRoute({
    component: () => (
      <UIProvider>
        <PageSearchProvider>
          <QuickCreateProvider>
            <SlashFocusesSearch />
            <OpenInReview />
            <Outlet />
            <QuickCreateDialog />
          </QuickCreateProvider>
        </PageSearchProvider>
      </UIProvider>
    ),
  });
  const list = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/',
    validateSearch: parseTaskListSearch,
    beforeLoad: () => (guardMs ? new Promise((resolve) => setTimeout(resolve, guardMs)) : undefined),
    component: function ListRoute() {
      const { projectKey } = list.useParams();
      return <TaskListScreen projectKey={projectKey} search={list.useSearch()} />;
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

const searchOf = (router: ReturnType<typeof renderApp>['router']) =>
  router.state.location.search as { task?: string };
const row = (key: string) => screen.getByRole('row', { name: new RegExp(`${key}\\b`) });
const pane = () => screen.getByRole('region', { name: 'Task detail' });

beforeEach(() => {
  api.current = createFakeApi();
});

describe('task list selection', () => {
  it('selects the task from ?task= and follows clicks into the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/PAY?task=PAY-3');

    await screen.findByRole('region', { name: 'Task detail' });
    expect(await within(pane()).findByRole('heading', { name: 'Task number 3' })).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /PAY-3\b/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(row('PAY-1')).getByText('Task number 1'));
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-1'));
    expect(row('PAY-1')).toHaveAttribute('aria-selected', 'true');
    expect(await within(pane()).findByRole('heading', { name: 'Task number 1' })).toBeInTheDocument();
  });

  it('groups by status with Backlog and Done collapsed, and expands them on demand', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await screen.findByRole('row', { name: /PAY-1\b/ });

    const groupNames = screen
      .getAllByRole('row')
      .filter((element) => element.hasAttribute('data-group-row'))
      .map((element) => element.textContent);
    expect(groupNames).toEqual([
      'In progress1, expanded',
      'In review1, expanded',
      'Todo2, expanded',
      'Backlog1, collapsed',
      'Done1, collapsed',
    ]);
    expect(screen.queryByRole('row', { name: /PAY-5\b/ })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('grid')).getByText('Backlog'));
    expect(await screen.findByRole('row', { name: /PAY-5\b/ })).toBeInTheDocument();
  });
});

describe('keyboard flow', () => {
  it('moves with J/K, opens with Enter, returns with Esc and clears with Esc', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/PAY');
    await screen.findByRole('row', { name: /PAY-1\b/ });

    // J from the page selects the first task and puts focus in the table.
    await user.keyboard('j');
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-1'));
    await waitFor(() => expect(row('PAY-1').contains(document.activeElement)).toBe(true));

    // In the table, J and K move between tasks, skipping group rows; the row, the pane and the URL follow.
    await user.keyboard('j');
    await waitFor(() => expect(row('PAY-2')).toHaveAttribute('aria-selected', 'true'));
    expect(await within(pane()).findByRole('heading', { name: 'Task number 2' })).toBeInTheDocument();
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-2'));
    await waitFor(() => expect(row('PAY-2').contains(document.activeElement)).toBe(true));
    await user.keyboard('k');
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-1'));

    // Enter opens the task page; Esc goes back to the list with the task selected.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/PAY/PAY-1'));
    expect(await screen.findByRole('button', { name: 'Back to list' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/PAY'));
    expect(searchOf(router).task).toBe('PAY-1');

    // Esc on the list clears the selection.
    await screen.findByRole('row', { name: /PAY-1\b/ });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(searchOf(router).task).toBeUndefined());
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument();
  });

  it('moves exactly one row per quick J/K press, from the last requested task', async () => {
    // Order in the table: PAY-1 (in progress), PAY-2 (in review), PAY-4, PAY-3 (todo, urgent first).
    const user = userEvent.setup({ delay: null });
    const { router } = renderApp('/p/PAY?task=PAY-2', { guardMs: 250 });
    await screen.findByRole('row', { name: /PAY-2\b/ });

    // J J K K J about 100 to 160 ms apart while navigations are slow: PAY-4, PAY-3, PAY-4, PAY-2, PAY-4.
    await user.keyboard('j');
    await new Promise((resolve) => setTimeout(resolve, 160));
    await user.keyboard('j');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.keyboard('kk');
    await new Promise((resolve) => setTimeout(resolve, 160));
    await user.keyboard('j');
    expect(row('PAY-4')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-4'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(searchOf(router).task).toBe('PAY-4');
    expect(row('PAY-4')).toHaveAttribute('aria-selected', 'true');

    // No pause at all between keys: PAY-2, PAY-4, PAY-3, PAY-4, PAY-2.
    await user.keyboard('kjjkk');

    expect(row('PAY-2')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-2'));
    // Late URL writes must not pull the selection back.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(searchOf(router).task).toBe('PAY-2');
    expect(row('PAY-2')).toHaveAttribute('aria-selected', 'true');

    // A press right after the URL caught up still moves one row.
    await user.keyboard('j');
    expect(row('PAY-4')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-4'));
  });

  it('focuses the search with / and filters by the typed text', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/PAY');
    await screen.findByRole('row', { name: /PAY-1\b/ });

    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveFocus();
    await user.keyboard('number 3');
    await waitFor(() => expect((router.state.location.search as { q?: string }).q).toBe('number 3'));
    await waitFor(() => expect(screen.queryByRole('row', { name: /PAY-1\b/ })).not.toBeInTheDocument());
    expect(row('PAY-3')).toBeInTheDocument();
  });
});

describe('optimistic edits', () => {
  it('shows a new title at once and rolls it back when the server refuses it', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY?task=PAY-2');
    const fake = api.current as FakeApi;
    await screen.findByRole('region', { name: 'Task detail' });
    await within(pane()).findByRole('heading', { name: 'Task number 2' });

    fake.control.failUpdates = true;
    const release = fake.hold();
    await user.click(within(pane()).getByRole('button', { name: 'Task number 2' }));
    const input = within(pane()).getByRole('textbox', { name: 'Title' });
    await user.clear(input);
    await user.type(input, 'Renamed task{Enter}');

    // Optimistic: the pane and the list row change before the server answers. Under a loaded full-suite
    // run the render can lag, so wait on the whole optimistic state with a generous timeout.
    await waitFor(
      () => {
        expect(within(pane()).getByRole('heading', { name: 'Renamed task' })).toBeInTheDocument();
        expect(within(row('PAY-2')).getByText('Renamed task')).toBeInTheDocument();
        expect(fake.calls.update).toEqual([{ key: 'PAY-2', title: 'Renamed task' }]);
      },
      { timeout: 10_000 },
    );

    await act(async () => release());
    // Rolled back, with the reason. The banner and the rollback come from the same failed mutation;
    // wait for both instead of reading the banner right after the heading.
    await waitFor(
      () => {
        expect(within(pane()).getByRole('heading', { name: 'Task number 2' })).toBeInTheDocument();
        expect(within(row('PAY-2')).getByText('Task number 2')).toBeInTheDocument();
        expect(within(pane()).getByRole('alert')).toHaveTextContent(
          "Couldn't save your change, so it was undone. Title is too long",
        );
      },
      { timeout: 10_000 },
    );
  });

  it('ticks a checkbox in the description and saves the new Markdown', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY?task=PAY-1');
    const fake = api.current as FakeApi;
    await screen.findByRole('region', { name: 'Task detail' });
    const boxes = await within(pane()).findAllByRole('checkbox', { name: 'Done' });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);

    await user.click(boxes[1] as HTMLElement);
    await waitFor(() =>
      expect(fake.calls.update).toEqual([
        { key: 'PAY-1', description: 'First line.\n\n- [x] Done thing\n- [x] Open thing' },
      ]),
    );
    // Ticking does not open the editor.
    expect(within(pane()).queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
  });
});

describe('quick create', () => {
  it('creates two tasks with Create more on, selecting each new task in the list', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/PAY');
    const fake = api.current as FakeApi;
    await screen.findByRole('row', { name: /PAY-1\b/ });

    await user.click(screen.getByRole('button', { name: /^New/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    const title = within(dialog).getByRole('textbox', { name: 'Title' });
    await waitFor(() => expect(title).toHaveFocus());

    await user.click(within(dialog).getByRole('switch', { name: 'Create more' }));
    await user.click(title);
    await user.keyboard('First new task');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(fake.calls.create).toHaveLength(1));
    expect(fake.calls.create[0]).toMatchObject({
      project: 'PAY',
      title: 'First new task',
      status: 'todo',
      priority: 'none',
      assignee: null,
    });
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-7'));
    // Still open, emptied and ready for the next one.
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
    expect(within(dialog).getByText('Created PAY-7')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue(''));

    // I assigns to me when focus is not in a text field.
    await user.click(within(dialog).getByRole('button', { name: /Assign to me/ }));
    await user.click(within(dialog).getByRole('textbox', { name: 'Title' }));
    await user.keyboard('Second new task');
    await user.click(within(dialog).getByRole('button', { name: /Create task/ }));

    await waitFor(() => expect(fake.calls.create).toHaveLength(2));
    expect(fake.calls.create[1]).toMatchObject({
      title: 'Second new task',
      assignee: fake.tasks[0]?.createdBy.id,
    });
    await waitFor(() => expect(searchOf(router).task).toBe('PAY-8'));
    // The dialog hides the page from assistive tech while open, hence hidden: true.
    expect(await screen.findByRole('row', { name: /PAY-8\b/, hidden: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('preselects the status passed to open() for that opening only', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY');
    const fake = api.current as FakeApi;
    await screen.findByRole('row', { name: /PAY-1\b/ });

    await user.click(screen.getByRole('button', { name: 'Open in review' }));
    let dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(within(dialog).getByRole('button', { name: /In review/ })).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Review me{Control>}{Enter}{/Control}',
    );
    await waitFor(() => expect(fake.calls.create).toHaveLength(1));
    expect(fake.calls.create[0]).toMatchObject({ title: 'Review me', status: 'in_review' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The next plain open starts from the default status again.
    await user.click(screen.getByRole('button', { name: /^New/ }));
    dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(within(dialog).getByRole('button', { name: /Todo/ })).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Plain{Control>}{Enter}{/Control}',
    );
    await waitFor(() => expect(fake.calls.create).toHaveLength(2));
    expect(fake.calls.create[1]).toMatchObject({ title: 'Plain', status: 'todo' });
  });

  it('closes after creating when Create more is off', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await screen.findByRole('row', { name: /PAY-1\b/ });

    await user.click(screen.getByRole('button', { name: /^New/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Only task{Control>}{Enter}{/Control}',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('row', { name: /PAY-7\b/ })).toHaveAttribute('aria-selected', 'true');
  });
});
