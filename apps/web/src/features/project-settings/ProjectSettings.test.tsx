import { ORPCError } from '@orpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BacklogStatusView, NoSource, setupHref } from './BacklogSettings';
import { DetachDialog } from './DetachDialog';
import { CONNECTION, sourceStatus } from './fixtures';
import { GeneralForm } from './GeneralSettings';
import { type GeneralProject, generalFailure, keyLockReason, projectChanges } from './general';
import { webhookSteps } from './WebhookDialog';

// These screens are rendered from props; the stub keeps the API and server modules out.
vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const fail = (): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === 'string' ? fail() : undefined),
      apply: () => Promise.reject(new Error('no API in these tests')),
    });
  const client = fail();
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

function withQuery(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const PROJECT: GeneralProject = {
  key: 'OPS',
  name: 'Operations',
  description: 'Runbooks',
  usesMilestones: true,
  usesCycles: true,
  repository: 'https://gitlab.com/reddevs/ops-runbooks.git',
  locked: [],
};

const MIRRORED: GeneralProject = {
  ...PROJECT,
  key: 'PAY',
  name: 'Payments',
  locked: ['key', 'repository', 'usesMilestones'],
};

describe('General settings', () => {
  it('sends only what changed, the key included while the project has no tasks', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<GeneralForm project={PROJECT} hasTasks={false} onSubmit={onSubmit} />);
    const key = screen.getByLabelText('Key');
    expect(key).not.toHaveAttribute('readonly');
    await user.clear(key);
    await user.type(key, 'opx');
    await user.click(screen.getByRole('switch', { name: 'Cycles' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ key: 'OPX', usesCycles: false });
    expect(await screen.findByText('Saved.')).toBeVisible();
  });

  it('locks the key and the milestones switch of a mirrored project, saying why', () => {
    render(<GeneralForm project={MIRRORED} hasTasks onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Key')).toHaveAttribute('readonly');
    expect(
      screen.getByText("Task keys embed it, and this project has tasks, so it can't change."),
    ).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Milestones' })).toBeDisabled();
    expect(screen.getByText(/stays on while Backlog\.md is mirrored/)).toBeVisible();
    expect(
      screen.getByText(
        'Matches gitlab.com/reddevs/ops-runbooks. The Backlog.md mirror reads this repository, so clearing it pauses the mirror.',
      ),
    ).toBeVisible();
  });

  it('refuses an empty name and shows server errors on their field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ field: 'repository', message: 'PAY reads Backlog.md from …' });
    render(<GeneralForm project={MIRRORED} hasTasks onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a project name.')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Name'), 'Payments');
    await user.clear(screen.getByLabelText(/Repository/));
    await user.type(screen.getByLabelText(/Repository/), 'https://gitlab.com/x/y.git');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ repository: 'https://gitlab.com/x/y.git' });
    expect(await screen.findByText('PAY reads Backlog.md from …')).toBeVisible();
  });

  it('computes changes, failures and the key lock', () => {
    expect(projectChanges(PROJECT, { ...PROJECT, description: '  ', repository: '', key: 'OPS' })).toEqual({
      description: null,
      repository: null,
    });
    expect(
      generalFailure(
        new ORPCError('CONFLICT', { message: 'Milestones stay on', data: { field: 'usesMilestones' } }),
      ),
    ).toEqual({ field: 'usesMilestones', message: 'Milestones stay on' });
    expect(generalFailure(new ORPCError('FORBIDDEN'))).toEqual({
      message: "You don't have permission to change this project.",
    });
    expect(generalFailure(new Error('offline')).message).toMatch(/Couldn't save the project/);
    expect(keyLockReason(PROJECT, false)).toBeNull();
    expect(keyLockReason(PROJECT, undefined)).not.toBeNull();
    expect(keyLockReason({ ...PROJECT, locked: ['key'] }, false)).toMatch(/Backlog\.md files/);
  });
});

function statusView(props: Partial<Parameters<typeof BacklogStatusView>[0]> = {}) {
  const handlers = {
    onRefresh: vi.fn(),
    onOpenWebhook: vi.fn(),
    onDetach: vi.fn(),
    onUseAnotherConnection: vi.fn(),
  };
  render(
    withQuery(
      <BacklogStatusView
        status={sourceStatus()}
        projectName="Payments"
        canManage
        canRefresh
        {...handlers}
        {...props}
      />,
    ),
  );
  return handlers;
}

describe('Backlog.md settings', () => {
  it('shows a healthy mirror with its facts, mappings and actions', async () => {
    const user = userEvent.setup();
    const handlers = statusView();
    const source = screen.getByRole('region', { name: 'Source' });
    expect(source).toHaveTextContent('Mirroring');
    expect(source).toHaveTextContent('Mirror · follows the default branch');
    expect(within(source).getByRole('link', { name: 'gitlab.com/reddevs/payments' })).toHaveAttribute(
      'href',
      'https://gitlab.com/reddevs/payments',
    );
    expect(within(source).getByRole('link', { name: '9 hidden, removed from Backlog.md' })).toHaveAttribute(
      'href',
      '/p/PAY?hidden=only',
    );
    expect(screen.getByText('None. Every file was read and every value is mapped.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Edit mappings' })).toHaveAttribute(
      'href',
      '/p/PAY/backlog-setup?step=mappings&edit=1',
    );
    expect(screen.getByText('fallback')).toBeVisible();
    await user.click(within(source).getByRole('button', { name: 'Refresh now' }));
    expect(handlers.onRefresh).toHaveBeenCalled();
    await user.click(within(source).getByRole('button', { name: 'Setup' }));
    expect(handlers.onOpenWebhook).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Detach…' }));
    expect(handlers.onDetach).toHaveBeenCalled();
  });

  it('gives members a read-only page', () => {
    statusView({ canManage: false, canRefresh: false });
    expect(screen.getByText(/You can read this page\. Owners and admins can refresh/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Refresh now' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit mappings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detach…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Setup' })).toBeNull();
  });

  it('lists the problems of a refresh with warnings', () => {
    statusView({
      status: sourceStatus({
        state: 'warnings',
        problems: {
          nextCursor: 'next',
          counts: { files: 30, values: 1 },
          items: [
            {
              kind: 'file',
              path: 'backlog/tasks/back-12 - Split.md',
              backlogId: 'BACK-12',
              skipped: true,
              message: 'dependencies must be a flat list (line 9)',
            },
          ],
        },
      }),
    });
    const problems = screen.getByRole('list', { name: 'Problems in the last refresh' });
    expect(problems).toHaveTextContent('dependencies must be a flat list (line 9)');
    expect(screen.getByRole('button', { name: 'Show more (30 left)' })).toBeVisible();
    expect(screen.getByText('Skipped files keep their last good version, if they had one.')).toBeVisible();
  });

  it('explains a failed and a paused mirror', async () => {
    const user = userEvent.setup();
    const handlers = statusView({
      status: sourceStatus({
        state: 'paused',
        connection: { ...CONNECTION, status: 'unreachable' },
      }),
      canRefresh: false,
    });
    expect(screen.getByRole('note')).toHaveTextContent(
      "The mirror is paused: the connection GitLab · reddevs can't reach gitlab.com",
    );
    expect(screen.getByText('Host unreachable')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Use another connection' }));
    expect(handlers.onUseAnotherConnection).toHaveBeenCalled();
  });

  it('shows an import with its history and no actions', () => {
    statusView({
      status: sourceStatus({
        state: 'detached',
        mode: 'import',
        detachedAt: '2026-10-23T14:02:00Z',
        detachedBy: sourceStatus().createdBy,
        history: [
          {
            id: '00000000-0000-7000-8000-000000000e01',
            type: 'project.backlog_imported',
            actor: null,
            onBehalfOf: null,
            origin: 'backlog',
            originRef: 'a1b2c3d4e5',
            details: { mode: 'import', repository: 'gitlab.com/reddevs/payments', tasks: 412, milestones: 6 },
            createdAt: '2026-10-23T14:02:00Z',
          },
        ],
      }),
    });
    expect(screen.getByText(/^Imported once on Oct 23, 2026 by Ana Ruiz, then detached\./)).toBeVisible();
    expect(screen.getByText('used for the import')).toBeVisible();
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent(
      'Backlog.md imported 412 tasks and 6 milestones from gitlab.com/reddevs/payments a1b2c3d',
    );
    expect(screen.queryByRole('button', { name: 'Refresh now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detach…' })).toBeNull();
  });

  it('offers mirror and import on an empty project', () => {
    render(<NoSource project={{ key: 'OPS', repository: PROJECT.repository }} hasTasks={false} canManage />);
    expect(screen.getByRole('link', { name: 'Set up a mirror' })).toHaveAttribute(
      'href',
      '/p/OPS/backlog-setup?mode=mirror',
    );
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      setupHref('OPS', { mode: 'import' }),
    );
    expect(screen.getByText(/Repository: gitlab\.com\/reddevs\/ops-runbooks, from General/)).toBeVisible();
  });

  it('turns setup off for a project that has tasks', () => {
    render(<NoSource project={{ key: 'WEB', repository: PROJECT.repository }} hasTasks canManage />);
    expect(screen.getByRole('button', { name: 'Set up a mirror' })).toBeDisabled();
    expect(screen.getByText(/already has tasks/)).toBeVisible();
  });
});

describe('Detach dialog', () => {
  it('asks for the typed key before detaching', async () => {
    const user = userEvent.setup();
    const onDetach = vi.fn().mockResolvedValue({});
    const onOpenChange = vi.fn();
    render(
      <DetachDialog
        isOpen
        onOpenChange={onOpenChange}
        status={sourceStatus()}
        projectName="Payments"
        onDetach={onDetach}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Detach Payments from Backlog.md?' });
    expect(dialog).toHaveTextContent(
      "This can't be undone. Payments keeps all 412 tasks and 6 milestones as they are now, at commit a1b2c3d.",
    );
    expect(dialog).toHaveTextContent('9 hidden tasks stay hidden.');
    expect(dialog).toHaveTextContent('Remove the webhook in GitLab; it will get 410 Gone from now on.');
    const detach = within(dialog).getByRole('button', { name: 'Detach' });
    expect(detach).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type PAY to confirm'), 'pay');
    await user.click(detach);
    expect(onDetach).toHaveBeenCalledWith('pay');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Webhook steps', () => {
  it('has four steps per provider', () => {
    for (const provider of ['github', 'gitlab', 'gitea'] as const) {
      expect(webhookSteps(provider, 'gitlab.com/reddevs/payments', 'main')).toHaveLength(4);
    }
  });
});
