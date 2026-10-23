import type { ProjectWithCounts } from '@pm/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsTable } from './ProjectsTable';

function project(overrides: Partial<ProjectWithCounts>): ProjectWithCounts {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    key: 'PAY',
    name: 'Payments',
    description: 'Checkout, refunds, webhooks and payouts',
    usesMilestones: true,
    usesCycles: true,
    currentCycle: null,
    repository: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    openCounts: { backlog: 3, todo: 4, in_progress: 3, in_review: 2 },
    openCount: 12,
    lastActivityAt: '2026-10-20T10:00:00.000Z',
    assignees: [],
    ...overrides,
  };
}

const PROJECTS = [
  project({ repository: 'git@gitlab.com:reddevs/payments.git' }),
  project({
    id: '10000000-0000-4000-8000-000000000002',
    key: 'INF',
    name: 'Infra',
    description: 'Servers, backups and deploys',
  }),
  project({
    id: '10000000-0000-4000-8000-000000000003',
    key: 'OPS',
    name: 'Ops runbooks',
    description: null,
    repository: 'not a url',
  }),
];

function rowOf(name: string): HTMLElement {
  const row = screen.getAllByRole('row').find((item) => within(item).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

// jsdom does not navigate; keep link clicks from logging "not implemented" errors.
const preventNavigation = (event: Event) => event.preventDefault();
beforeEach(() => document.addEventListener('click', preventNavigation));
afterEach(() => document.removeEventListener('click', preventNavigation));

describe('ProjectsTable', () => {
  it('shows the repository short form as a link to its page in a new tab', () => {
    render(<ProjectsTable projects={PROJECTS} onOpen={vi.fn()} />);
    const link = within(rowOf('Payments')).getByRole('link', { name: 'gitlab.com/reddevs/payments' });
    expect(link).toHaveAttribute('href', 'https://gitlab.com/reddevs/payments');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('shows no repository line when the project has none or it does not parse', () => {
    render(<ProjectsTable projects={PROJECTS} onOpen={vi.fn()} />);
    expect(within(rowOf('Infra')).getAllByRole('link')).toHaveLength(1);
    expect(within(rowOf('Ops runbooks')).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText('not a url')).not.toBeInTheDocument();
  });

  it('opens the project from the row but not from the repository link', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ProjectsTable projects={PROJECTS} onOpen={onOpen} />);
    const row = rowOf('Payments');

    const link = within(row).getByRole('link', { name: 'gitlab.com/reddevs/payments' });
    await user.click(link);
    expect(onOpen).not.toHaveBeenCalled();

    link.focus();
    expect(link).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).not.toHaveBeenCalled();

    // The same row still opens from its other cells.
    await user.click(within(row).getByText('PAY'));
    expect(onOpen).toHaveBeenCalledWith('PAY');
  });

  it('uses 64px rows plus the divider, loading included', () => {
    const { rerender } = render(<ProjectsTable projects={PROJECTS} onOpen={vi.fn()} />);
    const cell = within(rowOf('Infra')).getAllByRole('gridcell')[0] as HTMLElement;
    expect(cell.style.height).toBe('65px');
    rerender(<ProjectsTable projects={[]} isLoading onOpen={vi.fn()} />);
    const skeletonRows = document.querySelectorAll<HTMLElement>('[aria-busy="true"] > div + div');
    expect(skeletonRows.length).toBeGreaterThan(0);
    for (const skeleton of skeletonRows) expect(skeleton.style.height).toBe('65px');
  });

  it('says where tasks come from and explains the sidebar marker', () => {
    const summary = {
      mode: 'mirror' as const,
      state: 'failed' as const,
      defaultBranch: 'main',
      lastReadAt: '2026-10-20T10:00:00.000Z',
      lastReadCommit: 'a1b2c3d',
      lastTrigger: 'webhook' as const,
      problems: { files: 0, values: 0 },
      hidden: 0,
      detachedAt: null,
    };
    render(
      <ProjectsTable
        projects={[
          project({ backlog: summary }),
          project({
            id: '10000000-0000-4000-8000-000000000004',
            key: 'WEB',
            name: 'Web app',
            backlog: {
              ...summary,
              mode: 'import',
              state: 'detached',
              detachedAt: '2026-10-21T10:00:00.000Z',
            },
          }),
          PROJECTS[1] as ProjectWithCounts,
        ]}
        onOpen={vi.fn()}
      />,
    );
    expect(within(rowOf('Payments')).getByText('Backlog.md mirror')).toBeInTheDocument();
    expect(within(rowOf('Payments')).getByRole('img', { name: 'Last refresh failed' })).toBeInTheDocument();
    expect(within(rowOf('Web app')).getByText('This app · imported')).toBeInTheDocument();
    expect(within(rowOf('Infra')).getByText('This app')).toBeInTheDocument();
    expect(
      screen.getByText('The small square next to a project key in the sidebar marks a Backlog.md mirror.'),
    ).toBeInTheDocument();
  });

  it('leaves the marker note out when nothing mirrors', () => {
    render(<ProjectsTable projects={PROJECTS} onOpen={vi.fn()} />);
    expect(screen.queryByText(/marks a Backlog\.md mirror/)).not.toBeInTheDocument();
  });
});
