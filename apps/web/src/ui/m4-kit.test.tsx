import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatRailCount, Rail, type RailNavItem } from './layout/Rail';
import { QUEUE_COLUMNS, Queue, QueueGroupFooter, QueueGroupHeader, QueueRow } from './Queue';
import { WarnPill } from './WarnPill';

const countLabel = (n: number) => `${n} items need you`;

function renderRail(dashboard: Partial<RailNavItem>) {
  return render(
    <Rail
      workspace={{ name: 'Reddevs', initial: 'R' }}
      nav={[
        { id: 'dashboard', label: 'Dashboard', href: '/dashboard', countLabel, ...dashboard },
        { id: 'my-tasks', label: 'My tasks', href: '/my-tasks' },
      ]}
      user={{ name: 'Ana Ruiz' }}
    />,
  );
}

describe('Rail nav count', () => {
  it('shows the count under the label and puts the phrase in the accessible name', () => {
    renderRail({ count: 8, isCurrent: true });
    const link = screen.getByRole('link', { name: 'Dashboard, 8 items need you' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveAttribute('data-count', '8');
    expect(link.className).toContain('h-[46px]');
    expect(within(link).getByText('8')).toHaveAttribute('aria-hidden', 'true');
  });

  it('caps the badge at 99+ but keeps the real number in the name', () => {
    renderRail({ count: 140 });
    const link = screen.getByRole('link', { name: 'Dashboard, 140 items need you' });
    expect(within(link).getByText('99+')).toBeInTheDocument();
    expect(formatRailCount(99)).toBe('99');
    expect(formatRailCount(100)).toBe('99+');
  });

  it('hides the badge at 0 and keeps the normal item height', () => {
    renderRail({ count: 0 });
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).not.toHaveAttribute('data-count');
    expect(link.className).toContain('h-[38px]');
    expect(link.textContent).toBe('Dashboard');
  });

  it('falls back to the bare number without countLabel', () => {
    render(
      <Rail
        workspace={{ name: 'Reddevs' }}
        nav={[{ id: 'dashboard', label: 'Dashboard', href: '/dashboard', count: 3 }]}
        user={{ name: 'Ana Ruiz' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Dashboard, 3' })).toBeInTheDocument();
  });
});

describe('WarnPill', () => {
  it('renders the text on the warn ground', () => {
    render(<WarnPill>no update 26h</WarnPill>);
    const pill = screen.getByText('no update 26h');
    expect(pill).toHaveAttribute('data-tone', 'warn');
    expect(pill.className).toContain('bg-warn-bg');
    expect(pill.className).toContain('text-warn');
  });
});

describe('QueueGroupHeader', () => {
  it('shows glyph, name as a heading, count, Show all and the group key', async () => {
    const onShowAll = vi.fn();
    render(
      <QueueGroupHeader
        kind="review"
        label="In review"
        count={12}
        showAll={{ label: 'Show all 12', onPress: onShowAll }}
        hotkey="1"
        data-testid="gh"
      />,
    );
    const header = screen.getByTestId('gh');
    expect(header).toHaveAttribute('data-group', 'review');
    expect(header).not.toHaveAttribute('data-empty');
    expect(header.className).toContain('bg-band');
    expect(screen.getByRole('heading', { level: 3, name: 'In review' })).toBeInTheDocument();
    expect(header.querySelector('[data-glyph="review"]')).toHaveAttribute('aria-hidden', 'true');
    expect(header.querySelector('[data-part="count"]')).toHaveTextContent('12');
    expect(within(header).getByText('1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show all 12/ }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it.each([
    ['mention', '@'],
    ['stalled', ''],
    ['deadline', ''],
  ] as const)('draws the %s glyph', (kind, text) => {
    render(<QueueGroupHeader kind={kind} label="Group" count={2} data-testid="gh" />);
    const glyph = screen.getByTestId('gh').querySelector(`[data-glyph="${kind}"]`);
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent).toBe(text);
  });

  it('turns quiet at 0: faint, no band, empty text, no Show all', () => {
    render(
      <QueueGroupHeader
        kind="stalled"
        label="Stalled"
        count={0}
        emptyText="Nothing stalled"
        showAll={{ label: 'Show all 0' }}
        hotkey="3"
        data-testid="gh"
      />,
    );
    const header = screen.getByTestId('gh');
    expect(header).toHaveAttribute('data-empty', 'true');
    expect(header.className).toContain('text-faint');
    expect(header.className).not.toContain('bg-band');
    expect(screen.getByText('Nothing stalled')).toBeInTheDocument();
    expect(screen.queryByText('Show all 0')).toBeNull();
  });

  it('hides the empty text while the group has items', () => {
    render(<QueueGroupHeader kind="stalled" label="Stalled" count={1} emptyText="Nothing stalled" />);
    expect(screen.queryByText('Nothing stalled')).toBeNull();
  });
});

describe('QueueRow', () => {
  it('lays cells on the given columns', () => {
    render(
      <QueueRow columns={QUEUE_COLUMNS.panel} data-testid="row">
        <span>a</span>
      </QueueRow>,
    );
    const row = screen.getByTestId('row');
    expect(row.style.gridTemplateColumns).toBe(QUEUE_COLUMNS.panel);
    expect(row).not.toHaveAttribute('data-selected');
    expect(row.className).toContain('hover:bg-band');
  });

  it('mirrors each state in a data attribute and class', () => {
    const { rerender } = render(<QueueRow data-testid="row" isHovered />);
    const row = () => screen.getByTestId('row');
    expect(row()).toHaveAttribute('data-hovered', 'true');
    expect(row().className).toMatch(/(^| )bg-band( |$)/);

    rerender(<QueueRow data-testid="row" isFocused />);
    expect(row()).toHaveAttribute('data-focused', 'true');
    expect(row().className).toMatch(/(^| )focus-ring-inset( |$)/);

    rerender(<QueueRow data-testid="row" isSelected />);
    expect(row()).toHaveAttribute('data-selected', 'true');
    expect(row().className).toContain('bg-sel');
    expect(row().className).toContain('shadow-[inset_2px_0_0_var(--accent)]');
    expect(row().className).not.toContain('hover:bg-band');

    rerender(<QueueRow data-testid="row" twoLine />);
    expect(row()).toHaveAttribute('data-two-line', 'true');
    expect(row().className).toContain('items-start');
  });

  it('passes through focus handling attributes', () => {
    render(<QueueRow data-testid="row" tabIndex={-1} role="row" aria-selected="true" />);
    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '-1');
  });
});

describe('Queue surface', () => {
  it('labels the section with its title and shows count and note', () => {
    render(
      <Queue title="Needs you" count={8} note="Items leave when they are handled.">
        <QueueGroupFooter action={{ label: 'Collapse' }}>Showing 50 of 120.</QueueGroupFooter>
      </Queue>,
    );
    const region = screen.getByRole('region', { name: 'Needs you' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Needs you' })).toBeInTheDocument();
    expect(region.querySelector('[data-part="count"]')).toHaveTextContent('8');
    expect(within(region).getByText('Items leave when they are handled.')).toBeInTheDocument();
    expect(within(region).getByText('Showing 50 of 120.')).toBeInTheDocument();
    expect(within(region).getByText('Collapse')).toBeInTheDocument();
  });

  it('omits the count while loading', () => {
    render(<Queue title="Needs you" />);
    expect(screen.getByRole('region', { name: 'Needs you' }).querySelector('[data-part="count"]')).toBeNull();
  });
});
