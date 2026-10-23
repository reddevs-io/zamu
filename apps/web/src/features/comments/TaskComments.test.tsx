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
import { createFakeApi, FAKE_MILESTONES, FAKE_PEOPLE, type FakeApi } from '~/features/tasks/fake-api';
import { QuickCreateDialog } from '~/features/tasks/QuickCreateDialog';
import { TaskDetailPane } from '~/features/tasks/TaskDetailPane';
import { TaskPage } from '~/features/tasks/TaskPage';
import { Button, UIProvider } from '~/ui';
import { clearCommentDrafts } from './CommentComposer';
import { resetTimelinePreferences } from './TaskTimeline';

// Component tests of the task timeline, the comment composer and the milestone and cycle fields, against
// the in-memory /api/v1 client inside a real TanStack router.

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

function NewTaskButton({ projectKey }: { projectKey: string }) {
  const quickCreate = useQuickCreate();
  return <Button onPress={() => quickCreate.open(projectKey)}>New</Button>;
}

function renderApp(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } },
  });
  const root = createRootRoute({
    component: () => (
      <UIProvider>
        <QuickCreateProvider>
          <Outlet />
          <QuickCreateDialog />
        </QuickCreateProvider>
      </UIProvider>
    ),
  });
  // Stand-in for the list: the pane alone, for PAY-1 or ?task=.
  const list = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/',
    component: function ListRoute() {
      const { projectKey } = list.useParams();
      const search = list.useSearch() as { task?: string };
      return (
        <>
          <NewTaskButton projectKey={projectKey} />
          <section aria-label="Task detail" className="flex flex-col">
            <TaskDetailPane projectKey={projectKey} taskKey={search.task ?? 'PAY-1'} onClose={() => {}} />
          </section>
        </>
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
  const cyclePage = createRoute({
    getParentRoute: () => root,
    path: '/p/$projectKey/cycles/$number',
    component: function CycleRoute() {
      const { projectKey } = cyclePage.useParams();
      return <NewTaskButton projectKey={projectKey} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, page, cyclePage]),
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
const history = () => screen.getByRole('region', { name: 'Activity and comments' });
const comment = (author: string) =>
  within(history()).getAllByRole('article', { name: `Comment by ${author}` });
const composer = () => screen.getByRole('textbox', { name: 'Comment' });
const fake = () => api.current as FakeApi;

beforeEach(() => {
  api.current = createFakeApi();
  clearCommentDrafts();
  resetTimelinePreferences();
});

describe('timeline', () => {
  it('shows activity and comments in time order, with chips, edited and deleted states', async () => {
    renderApp('/p/PAY/PAY-1');
    const anaComment = await waitFor(() => {
      const [found] = comment('Ana Ruiz');
      if (!found) throw new Error('not yet');
      return found;
    });

    // One-line activity, then the comments; the agent comment carries "for Ana Ruiz".
    expect(within(history()).getByText('created the task')).toBeInTheDocument();
    const [tomas] = comment('Tomás Berg');
    expect(within(tomas as HTMLElement).getByText('· edited')).toBeInTheDocument();
    const [claude] = comment('claude-dev');
    expect(within(claude as HTMLElement).getByText('for Ana Ruiz')).toBeInTheDocument();
    expect(within(claude as HTMLElement).getByText('4xx stops retrying')).toBeInTheDocument();
    expect(within(history()).getByText(/Comment deleted by Tomás Berg/)).toBeInTheDocument();

    // Mention chip, kept http link, dropped javascript: link.
    const chip = anaComment.querySelector('[data-mention="agent"]');
    expect(chip).toHaveTextContent('claude-dev');
    expect(within(anaComment).getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com/retry',
    );
    expect(within(anaComment).queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(anaComment).toHaveTextContent('bad');

    // Order: Tomás (32m) before Ana (28m) before claude-dev (3m).
    const authors = within(history())
      .getAllByRole('article')
      .map((element) => element.getAttribute('aria-label'));
    expect(authors).toEqual(['Comment by Tomás Berg', 'Comment by Ana Ruiz', 'Comment by claude-dev']);
  });

  it('shows cycle ends by the hourly job as a system line', async () => {
    const ref = (number: number) => ({
      id: `60000000-0000-4000-8000-0000000000${number}`,
      number,
      name: null,
    });
    fake().activity.push({
      id: '40000000-0000-4000-8000-000000000999',
      type: 'cycle.ended',
      taskKey: 'PAY-1',
      actor: null,
      onBehalfOf: null,
      changes: [{ field: 'cycle', from: ref(12), to: ref(13) }],
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    });
    renderApp('/p/PAY/PAY-1');
    const line = await within(
      await screen.findByRole('region', { name: 'Activity and comments' }),
    ).findByText('Cycle 12 ended. Moved to Cycle 13.');
    expect(line.closest('[data-activity]')).toHaveAttribute('data-activity', 'cycle.ended');
  });

  it('filters to comments with "Comments only"', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await within(await screen.findByRole('region', { name: 'Activity and comments' })).findByText(
      'created the task',
    );
    await user.click(within(history()).getByRole('switch', { name: 'Comments only' }));
    expect(within(history()).queryByText('created the task')).not.toBeInTheDocument();
    expect(comment('claude-dev')).toHaveLength(1);
  });
});

describe('author-only actions', () => {
  it('offers Edit and Delete on your own comments only', async () => {
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    const [own] = comment('Ana Ruiz');
    expect(within(own as HTMLElement).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(own as HTMLElement).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    for (const other of [...comment('Tomás Berg'), ...comment('claude-dev')]) {
      expect(within(other).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(within(other).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    }
  });

  it('edits in place and saves with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    await user.click(within(comment('Ana Ruiz')[0] as HTMLElement).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit comment' });
    await user.clear(editor);
    await user.type(editor, 'Updated text');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(fake().calls.comments).toContainEqual({
        op: 'update',
        id: '70000000-0000-4000-8000-000000000002',
        body: 'Updated text',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Edit comment' })).not.toBeInTheDocument(),
    );
    const [own] = comment('Ana Ruiz');
    expect(within(own as HTMLElement).getByText('Updated text')).toBeInTheDocument();
    expect(within(own as HTMLElement).getByText('· edited')).toBeInTheDocument();
  });

  it('deletes after the confirmation and leaves the placeholder', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    await user.click(within(comment('Ana Ruiz')[0] as HTMLElement).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this comment?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fake().calls.comments).toContainEqual({
        op: 'delete',
        id: '70000000-0000-4000-8000-000000000002',
      }),
    );
    expect(await within(history()).findByText(/Comment deleted by Ana Ruiz/)).toBeInTheDocument();
    expect(within(history()).queryAllByRole('article', { name: 'Comment by Ana Ruiz' })).toHaveLength(0);
  });
});

describe('composer', () => {
  it('focuses with M, mentions with @ and Enter, and sends with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));

    await user.keyboard('m');
    await waitFor(() => expect(composer()).toHaveFocus());
    await user.keyboard('Thanks @cl');

    const picker = await screen.findByRole('listbox', { name: 'Mention' });
    const options = within(picker).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining('claude-dev')]);
    expect(options[0]).toHaveTextContent('agent · for Ana Ruiz');
    expect(composer()).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await user.keyboard('{Enter}');
    const link = `[@claude-dev](mention:${FAKE_PEOPLE.claude.id}) `;
    await waitFor(() => expect(composer()).toHaveValue(`Thanks ${link}`));
    expect(screen.queryByRole('listbox', { name: 'Mention' })).not.toBeInTheDocument();

    await user.keyboard('for the tests{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(fake().calls.comments).toContainEqual({
        op: 'create',
        key: 'PAY-1',
        body: `Thanks ${link}for the tests`,
      }),
    );
    await waitFor(() => expect(composer()).toHaveValue(''));
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(2));
    const sent = comment('Ana Ruiz')[1] as HTMLElement;
    expect(sent.querySelector('[data-mention="agent"]')).toHaveTextContent('claude-dev');
  });

  it('filters the picker as you type and closes it with Esc', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    await user.click(composer());
    await user.keyboard('@');
    const picker = await screen.findByRole('listbox', { name: 'Mention' });
    expect(within(picker).getAllByRole('option')).toHaveLength(3);
    await user.keyboard('to');
    await waitFor(() =>
      expect(
        within(picker)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([expect.stringContaining('Tomás Berg')]),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Mention' })).not.toBeInTheDocument());
    expect(composer()).toHaveValue('@to');
  });

  it('keeps the text when sending fails and sends it on Try again', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    fake().control.failComments = true;
    let release = () => {};
    fake().control.holdComments = new Promise<void>((resolve) => {
      release = resolve;
    });

    await user.click(composer());
    await user.keyboard('Looks good{Control>}{Enter}{/Control}');
    // Sending state.
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    await act(async () => release());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't send. Your text is still here.");
    expect(composer()).toHaveValue('Looks good');

    fake().control.failComments = false;
    fake().control.holdComments = null;
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(composer()).toHaveValue(''));
    expect(fake().calls.comments.filter((call) => call.op === 'create')).toHaveLength(2);
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(2));
  });

  it('switches to Preview with Shift+P outside the text box', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    await user.click(composer());
    await user.keyboard('Some **bold** P');
    expect(composer()).toHaveValue('Some **bold** P');
    await user.click(document.body);
    await user.keyboard('{Shift>}P{/Shift}');
    const preview = await screen.findByRole('tabpanel');
    expect(within(preview).getByText('bold').tagName).toBe('STRONG');
  });
});

describe('milestone and cycle fields', () => {
  it('sets the milestone from the pane with Shift+M', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY');
    await within(await screen.findByRole('region', { name: 'Task detail' })).findByRole('heading', {
      name: 'Task number 1',
    });
    await within(pane()).findByRole('button', { name: 'Milestone: none' });

    await user.keyboard('{Shift>}M{/Shift}');
    const menu = await screen.findByRole('menu', { name: /^Milestone/ });
    expect(within(menu).getByRole('menuitemradio', { name: /No milestone/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: /Webhooks v2/ }));

    await waitFor(() =>
      expect(fake().calls.update).toContainEqual({ key: 'PAY-1', milestone: FAKE_MILESTONES.webhooks }),
    );
    expect(await within(pane()).findByRole('button', { name: 'Milestone: Webhooks v2' })).toHaveTextContent(
      '50%',
    );
  });

  it('sets and clears the cycle on the task page', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/PAY-2');
    const trigger = await screen.findByRole('button', { name: 'Cycle: none' });
    await user.click(trigger);
    const menu = await screen.findByRole('menu', { name: /^Cycle/ });
    expect(within(menu).getByRole('menuitemradio', { name: /Cycle 12/ })).toHaveTextContent(
      'current · 4d left',
    );
    await user.click(within(menu).getByRole('menuitemradio', { name: /Cycle 13/ }));
    await waitFor(() => expect(fake().calls.update).toContainEqual({ key: 'PAY-2', cycle: 13 }));
    await screen.findByRole('button', { name: 'Cycle: Cycle 13' });

    await user.keyboard('{Shift>}C{/Shift}');
    const again = await screen.findByRole('menu', { name: /^Cycle/ });
    await user.click(within(again).getByRole('menuitemradio', { name: /No cycle/ }));
    await waitFor(() => expect(fake().calls.update).toContainEqual({ key: 'PAY-2', cycle: null }));
  });

  it('hides the fields when the project does not use them', async () => {
    api.current = createFakeApi({ usesMilestones: false, usesCycles: false });
    renderApp('/p/PAY/PAY-1');
    await waitFor(() => expect(comment('Ana Ruiz')).toHaveLength(1));
    expect(screen.getByText('Assignee')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Milestone:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cycle:/ })).not.toBeInTheDocument();
  });
});

describe('quick create', () => {
  it('prefills the cycle from the cycle page and sends it', async () => {
    const user = userEvent.setup();
    renderApp('/p/PAY/cycles/13');
    await user.click(await screen.findByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(await within(dialog).findByRole('button', { name: 'Cycle: Cycle 13' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Milestone: none' })).toBeInTheDocument();
    expect(
      within(dialog).getByText('Milestone and cycle default to the page you opened this from.'),
    ).toBeVisible();

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Alert merchants');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(fake().calls.create).toHaveLength(1));
    expect(fake().calls.create[0]).toMatchObject({ project: 'PAY', title: 'Alert merchants', cycle: 13 });
    expect(fake().calls.create[0]).not.toHaveProperty('milestone');
  });

  it('prefills the milestone from the list filter and lets Shift+C pick a cycle', async () => {
    const user = userEvent.setup();
    renderApp(`/p/PAY?task=PAY-2&milestone=${FAKE_MILESTONES.pci}`);
    await user.click(await screen.findByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(await within(dialog).findByRole('button', { name: 'Milestone: PCI audit' })).toBeInTheDocument();

    // Shift+C works once focus leaves the title field.
    await user.click(within(dialog).getByText('New task'));
    await user.keyboard('{Shift>}C{/Shift}');
    const menu = await screen.findByRole('menu', { name: /^Cycle/ });
    await user.click(within(menu).getByRole('menuitemradio', { name: /Cycle 12/ }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cycle: Cycle 12' })).toBeInTheDocument(),
    );

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Audit logs');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(fake().calls.create).toHaveLength(1));
    expect(fake().calls.create[0]).toMatchObject({ milestone: FAKE_MILESTONES.pci, cycle: 12 });
  });
});
