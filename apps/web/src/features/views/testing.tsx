import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

// Test support for features/views (imported by its *.test.tsx only). The tests mock ~/lib/orpc with
// orpcMock(), backed by the small in-memory API below, and render inside a QueryClientProvider.
//
//   vi.mock('~/lib/orpc', async () => (await import('./testing')).orpcMock());

export const VIEWER = {
  id: '9f0c0a52-0000-4000-8000-000000000001',
  name: 'Ana Ruiz',
  kind: 'person' as const,
};

export const LABELS = [
  {
    id: '0b0d8c52-0000-4000-8000-000000000001',
    name: 'frontend',
    color: 4,
    source: 'app' as const,
    usageCount: 31,
  },
  {
    id: '0b0d8c52-0000-4000-8000-000000000002',
    name: 'backend',
    color: 3,
    source: 'app' as const,
    usageCount: 38,
  },
  {
    id: '0b0d8c52-0000-4000-8000-000000000003',
    name: 'mobile',
    color: 6,
    source: 'app' as const,
    usageCount: 27,
  },
  {
    id: '0b0d8c52-0000-4000-8000-000000000004',
    name: 'security',
    color: 1,
    source: 'app' as const,
    usageCount: 9,
  },
  {
    id: '0b0d8c52-0000-4000-8000-000000000005',
    name: 'i18n',
    color: 2,
    source: 'app' as const,
    usageCount: 12,
  },
];

export const MEMBERS = [
  { ...VIEWER, email: 'ana@example.com', role: 'owner', responsible: null },
  {
    id: '9f0c0a52-0000-4000-8000-000000000002',
    name: 'Tomás Ferreira',
    kind: 'person' as const,
    email: 'tomas@example.com',
    role: 'member',
    responsible: null,
  },
  {
    id: '9f0c0a52-0000-4000-8000-000000000003',
    name: 'claude-dev',
    kind: 'agent' as const,
    email: null,
    role: 'member',
    responsible: { id: VIEWER.id, name: VIEWER.name, kind: 'person' as const },
  },
];

/** The procedures the views read. */
export const fakeViewsClient = {
  me: {
    get: async () => ({
      user: { ...VIEWER, email: 'ana@example.com', responsible: null, theme: 'system' },
      role: 'owner',
    }),
  },
  members: { list: async () => ({ items: MEMBERS }) },
  labels: { list: async () => ({ items: LABELS }) },
  milestones: {
    list: async () => ({
      items: [
        {
          id: '2b2d8c52-0000-4000-8000-000000000001',
          name: 'Public beta',
          status: 'active',
          targetDate: null,
        },
      ],
    }),
  },
  cycles: {
    list: async () => ({
      items: [{ number: 12, name: null, state: 'current', startsOn: '2026-10-27', endsOn: '2026-11-09' }],
    }),
  },
};

export async function orpcMock() {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  return { client: fakeViewsClient, orpc: createTanstackQueryUtils(fakeViewsClient as never) };
}

export function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
}

/** Renders with a fresh QueryClient that already knows the viewer (as the app shell prefetches me.get). */
export async function renderWithQuery(ui: ReactElement) {
  const queryClient = newQueryClient();
  const { meQuery } = await import('~/features/tasks/queries');
  await queryClient.prefetchQuery(meQuery());
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}
