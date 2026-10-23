import { ORPCError } from '@orpc/client';
import type { Me, Theme } from '@pm/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orpc } from '~/lib/orpc';
import { AppearancePage } from './AppearancePage';
import { themeClass, useUserTheme } from './theme';

// The Appearance page and the theme hooks against a fake me.update. The cached me drives the <html>
// class (see routes/__root.tsx); the probe below renders the same value.

const api = vi.hoisted(() => ({
  update: null as null | ((input: { theme: Theme }) => Promise<Me>),
  calls: [] as { theme: Theme }[],
}));

vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const client = {
    me: {
      get: async () => {
        throw new Error('not fetched in these tests');
      },
      update: (input: { theme: Theme }) => {
        api.calls.push(input);
        return api.update?.(input);
      },
    },
  };
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

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

function HtmlClassProbe() {
  return <output aria-label="html class">{themeClass(useUserTheme()) ?? 'none'}</output>;
}

function renderPage(me: Me | undefined = ME) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (me) queryClient.setQueryData(orpc.me.get.queryKey(), me);
  render(
    <QueryClientProvider client={queryClient}>
      <HtmlClassProbe />
      <AppearancePage />
    </QueryClientProvider>,
  );
  return { queryClient };
}

beforeEach(() => {
  // jsdom has no matchMedia: the system prefers light.
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  api.calls = [];
  api.update = async ({ theme }) => ({ ...ME, user: { ...ME.user, theme } });
});

describe('Appearance', () => {
  it('shows the saved theme and saves a new one at once', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked();
    expect(screen.getByText('now light')).toBeInTheDocument();
    expect(screen.getByLabelText('html class')).toHaveTextContent('none');

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByLabelText('html class')).toHaveTextContent('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await waitFor(() => expect(api.calls).toEqual([{ theme: 'dark' }]));
    await waitFor(() =>
      expect(queryClient.getQueryData<Me>(orpc.me.get.queryKey())?.user.theme).toBe('dark'),
    );
  });

  it('switches back and explains when the server refuses', async () => {
    api.update = async () => {
      throw new ORPCError('FORBIDDEN', { status: 403 });
    };
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(
      await screen.findByText(
        /Couldn't save your theme, so it was switched back\. Only people signed in here/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked();
    expect(screen.getByLabelText('html class')).toHaveTextContent('none');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Couldn't save your theme/)).not.toBeInTheDocument();
  });

  it('follows the system when signed out (no cached account)', () => {
    renderPage(undefined);
    expect(screen.getByLabelText('html class')).toHaveTextContent('none');
    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked();
  });
});
