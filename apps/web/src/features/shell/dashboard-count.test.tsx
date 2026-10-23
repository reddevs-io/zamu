import type { Dashboard, DashboardCounts } from '@pm/contracts';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardQuery } from '~/features/dashboard/queries';
import { railCountLabel, useDashboardRailCount, useRefreshDashboardAfterEdits } from './dashboard-count';

// The rail count: GET /dashboard/counts on every page, the page's own Mine answer on the dashboard, and a
// refresh after any successful edit.

const api = vi.hoisted(() => ({
  counts: 0,
  countsCalls: 0,
  pageTotal: 0,
}));

vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const client = {
    dashboard: {
      counts: async (): Promise<DashboardCounts> => {
        api.countsCalls += 1;
        return { review: api.counts, mentions: 0, stalled: 0, deadlines: 0, total: api.counts };
      },
      get: async (): Promise<Dashboard> => ({
        scope: 'mine',
        generatedAt: new Date().toISOString(),
        groups: {
          review: { total: api.pageTotal, items: [] },
          mentions: { total: 1, items: [] },
          stalled: { total: 0, items: [] },
          deadlines: { total: 0, items: [] },
        },
        projects: [],
        agents: [],
      }),
    },
  };
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

function Rail() {
  const count = useDashboardRailCount();
  useRefreshDashboardAfterEdits();
  const edit = useMutation({ mutationFn: async () => 'ok' });
  return (
    <>
      <output aria-label="rail count">{count ?? 'none'}</output>
      <button type="button" onClick={() => edit.mutate()}>
        Edit
      </button>
    </>
  );
}

function DashboardPage() {
  useQuery(dashboardQuery('mine'));
  return <p>dashboard</p>;
}

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } },
  });
  const root = createRootRoute({
    component: () => (
      <>
        <Rail />
        <Outlet />
      </>
    ),
  });
  const routes = [
    createRoute({ getParentRoute: () => root, path: '/dashboard', component: DashboardPage }),
    createRoute({ getParentRoute: () => root, path: '/projects', component: () => <p>projects</p> }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

beforeEach(() => {
  api.counts = 8;
  api.countsCalls = 0;
  api.pageTotal = 4;
});

describe('rail count', () => {
  it('reads the counts endpoint away from the dashboard', async () => {
    renderAt('/projects');
    await waitFor(() => expect(screen.getByLabelText('rail count')).toHaveTextContent('8'));
  });

  it("uses the dashboard's own Mine answer on the dashboard", async () => {
    renderAt('/dashboard');
    // review 4 + mentions 1
    await waitFor(() => expect(screen.getByLabelText('rail count')).toHaveTextContent('5'));
  });

  it('refreshes after a successful edit', async () => {
    const user = userEvent.setup();
    renderAt('/projects');
    await waitFor(() => expect(screen.getByLabelText('rail count')).toHaveTextContent('8'));
    api.counts = 7;
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(screen.getByLabelText('rail count')).toHaveTextContent('7'));
  });

  it('words the count for the accessible name', () => {
    expect(railCountLabel(8)).toBe('8 items need you');
    expect(railCountLabel(1)).toBe('1 item needs you');
  });
});
