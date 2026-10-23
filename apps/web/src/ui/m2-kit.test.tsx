import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { BoardCard, BoardColumn, SwimlaneHeader } from './Board';
import { Comment, CommentBody, CommentDeleted } from './Comment';
import { CommentEditor, Composer } from './Composer';
import { UserMenu } from './layout/UserMenu';
import {
  filterPickerItems,
  movePickerActive,
  type PickerItem,
  PickerList,
  PickerPopover,
  pickerOptionId,
} from './PickerPopover';
import { CycleGlyph } from './PlanningGlyph';
import { DaysLeftPill, formatDaysLeft, ProgressBar, TimeBar } from './Progress';
import { SegmentedControl } from './SegmentedControl';
import { StatStrip, StatTile } from './Stat';
import { Toast } from './Toast';
import { ViewTabs } from './ViewTabs';

const ANA = { name: 'Ana Ruiz', kind: 'person' as const };

const ITEMS: PickerItem[] = [
  { id: 'pci', label: 'PCI audit', meta: 'Oct 20', metaTone: 'warn' },
  { id: 'webhooks', label: 'Webhooks v2', meta: 'Nov 14' },
  { id: 'sepa', label: 'SEPA Direct Debit', meta: 'Jan 30', isDisabled: true },
];

function SegmentedExample({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<'list' | 'board'>('list');
  return (
    <SegmentedControl
      aria-label="View"
      items={[
        { id: 'list', label: 'List' },
        { id: 'board', label: 'Board' },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function FoldExample() {
  const [folded, setFolded] = useState(true);
  return (
    <BoardColumn status="done" count={64} isFolded={folded} onFoldChange={setFolded}>
      <span>card</span>
    </BoardColumn>
  );
}

function ComposerExample({
  onSubmit,
  error,
  isSending,
}: {
  onSubmit?: (value: string) => void;
  error?: string;
  isSending?: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={() => onSubmit?.(value)}
      renderPreview={(text) => <p data-testid="preview">{text}</p>}
      error={error}
      isSending={isSending}
    />
  );
}

function PickerExample({ onChange }: { onChange: (value: string | null) => void }) {
  return (
    <PickerPopover
      aria-label="Milestone"
      items={ITEMS}
      value="webhooks"
      onChange={onChange}
      none={{ label: 'No milestone' }}
      searchPlaceholder="Set milestone…"
      kbd="⇧M"
    >
      <AriaButton>Milestone</AriaButton>
    </PickerPopover>
  );
}

describe('ViewTabs', () => {
  it('marks the current tab and shows counts and notes', () => {
    render(
      <ViewTabs
        currentId="milestones"
        items={[
          { id: 'tasks', label: 'Tasks', href: '/p/PAY', count: 12 },
          { id: 'milestones', label: 'Milestones', href: '/p/PAY/milestones', count: 3 },
          { id: 'cycles', label: 'Cycles', href: '/p/PAY/cycles', note: 'C12 · 3d left' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Project views' });
    const current = within(nav).getByRole('link', { name: /Milestones/ });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /Tasks/ })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: /Cycles/ })).toHaveTextContent('C12 · 3d left');
  });
});

describe('SegmentedControl', () => {
  it('picks a segment by click and keeps one selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedExample onChange={onChange} />);
    const board = screen.getByRole('radio', { name: 'Board' });
    await user.click(board);
    expect(onChange).toHaveBeenCalledWith('board');
    expect(board).toBeChecked();
    // Clicking the selected segment again does not clear the selection.
    await user.click(board);
    expect(board).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves with arrow keys and selects with Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedExample onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'List' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Board' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('board');
  });
});

describe('progress and glyphs', () => {
  it('ProgressBar reports done of total and sizes both parts', () => {
    render(<ProgressBar done={14} inProgress={5} total={22} showCount />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '14');
    expect(bar).toHaveAttribute('aria-valuemax', '22');
    expect(bar).toHaveAttribute('aria-valuetext', '14 of 22 done, 5 in progress');
    expect(bar.querySelector('[data-part="done"]')).toHaveStyle({ width: `${(14 / 22) * 100}%` });
    expect(bar.querySelector('[data-part="in-progress"]')).toHaveStyle({ width: `${(5 / 22) * 100}%` });
    expect(screen.getByText('14/22')).toBeInTheDocument();
  });

  it('ProgressBar handles an empty total', () => {
    render(<ProgressBar done={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '0 of 0 done');
  });

  it('TimeBar shows elapsed days', () => {
    render(<TimeBar elapsedDays={11} totalDays={14} showCount />);
    expect(screen.getByRole('progressbar', { name: 'Time elapsed' })).toHaveAttribute(
      'aria-valuetext',
      'Day 11 of 14',
    );
    expect(screen.getByText('11/14d')).toBeInTheDocument();
  });

  it('DaysLeftPill warns at 3 days or fewer', () => {
    const { rerender } = render(<DaysLeftPill daysLeft={4} />);
    expect(screen.getByText('4 days left')).not.toHaveAttribute('data-warn');
    rerender(<DaysLeftPill daysLeft={3} />);
    expect(screen.getByText('3 days left')).toHaveAttribute('data-warn', 'true');
    expect(formatDaysLeft(1)).toBe('1 day left');
    expect(formatDaysLeft(0)).toBe('Last day');
    expect(formatDaysLeft(-1)).toBe('Ended');
  });

  it('CycleGlyph draws a pie for progress and is decorative without a label', () => {
    const { container, rerender } = render(<CycleGlyph state="progress" progress={0.79} />);
    const glyph = container.firstElementChild as HTMLElement;
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.style.getPropertyValue('--p')).toBe('79%');
    expect(glyph).toHaveAttribute('data-glyph', 'cycle-progress');
    rerender(<CycleGlyph state="done" label="Completed cycle" />);
    expect(screen.getByRole('img', { name: 'Completed cycle' })).toBeInTheDocument();
  });

  it('StatStrip lays out one column per tile', () => {
    render(
      <StatStrip aria-label="Cycle 11">
        <StatTile label="Scope" value={20} sub="2 added after start" />
        <StatTile label="Completed" value={16} tone="done" />
      </StatStrip>,
    );
    const strip = screen.getByLabelText('Cycle 11');
    expect(strip.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(within(strip).getByText('Scope')).toBeInTheDocument();
  });
});

describe('Board', () => {
  it('BoardCard omits empty parts and labels the assignee', () => {
    render(
      <BoardCard
        taskKey="PAY-142"
        title="Retry failed webhook deliveries"
        priority="high"
        milestone={{ name: 'Webhooks v2', filled: true }}
        cycle={{ label: 'C12' }}
        assignee={ANA}
        state="selected"
      />,
    );
    expect(screen.getByText('PAY-142')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Priority: High' })).toBeInTheDocument();
    expect(screen.getByText('Webhooks v2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ana Ruiz' })).toBeInTheDocument();
  });

  it('folds and expands a column', async () => {
    const user = userEvent.setup();
    render(<FoldExample />);
    expect(screen.queryByText('card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Done, 64 tasks' }));
    expect(screen.getByText('card')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fold Done, 64 tasks' }));
    expect(screen.queryByText('card')).not.toBeInTheDocument();
  });

  it('marks the drop target and shows the "more" footer', () => {
    const onAdd = vi.fn();
    render(
      <BoardColumn status="todo" count={60} isDropTarget onAdd={onAdd} more="49 more · scroll or press J" />,
    );
    expect(screen.getByRole('region', { name: 'Todo, 60 tasks' })).toHaveAttribute(
      'data-drop-target',
      'true',
    );
    expect(screen.getByText('49 more · scroll or press J')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task in Todo' })).toBeInTheDocument();
  });

  it('SwimlaneHeader toggles', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SwimlaneHeader title="No assignee" count={4} isOpen onOpenChange={onOpenChange} />);
    const button = screen.getByRole('button', { name: /No assignee/ });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Comment', () => {
  it('shows Edit and Delete only on your own comments', () => {
    const { rerender } = render(
      <Comment author={ANA} time="3m" onEdit={() => {}} onDelete={() => {}}>
        <CommentBody>
          <p>Hello</p>
        </CommentBody>
      </Comment>,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    rerender(
      <Comment author={ANA} time="3m" isOwn isEdited onEdit={() => {}} onDelete={() => {}}>
        <p>Hello</p>
      </Comment>,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('· edited')).toBeInTheDocument();
  });

  it('shows "for" for agents', () => {
    render(
      <Comment author={{ name: 'claude-dev', kind: 'agent' }} onBehalfOf="Ana Ruiz" time="3m">
        <p>Done.</p>
      </Comment>,
    );
    expect(screen.getByRole('article', { name: 'Comment by claude-dev' })).toHaveTextContent('for Ana Ruiz');
  });

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <Comment author={ANA} time="3m" isOwn onDelete={onDelete}>
        <p>Hello</p>
      </Comment>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this comment?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders the editor in place of the body', () => {
    render(
      <Comment
        author={ANA}
        time="3m"
        isOwn
        onEdit={() => {}}
        editor={<CommentEditor value="Edited" onChange={() => {}} onSave={() => {}} onCancel={() => {}} />}
      >
        <p>Original</p>
      </Comment>,
    );
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Edit comment' })).toHaveValue('Edited');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('CommentDeleted keeps a line in the history', () => {
    render(<CommentDeleted by="Tomás Berg" time="1h" />);
    expect(screen.getByText(/Comment deleted by Tomás Berg/)).toHaveTextContent(
      'Comment deleted by Tomás Berg · 1h',
    );
  });
});

describe('CommentEditor', () => {
  it('saves with Cmd/Ctrl+Enter and cancels with Esc', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<CommentEditor value="Text" onChange={() => {}} onSave={onSave} onCancel={onCancel} />);
    const box = screen.getByRole('textbox', { name: 'Edit comment' });
    expect(box).toHaveFocus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Composer', () => {
  it('sends with Cmd/Ctrl+Enter, not when blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ComposerExample onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await user.click(box);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(box, 'Looks good');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onSubmit).toHaveBeenCalledWith('Looks good');
  });

  it('leaves the box on Escape and keeps the text', async () => {
    const user = userEvent.setup();
    render(<ComposerExample />);
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await user.type(box, 'Half a thought');
    expect(box).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(box).not.toHaveFocus();
    expect(box).toHaveValue('Half a thought');
  });

  it('switches to Preview and renders Markdown', async () => {
    const user = userEvent.setup();
    render(<ComposerExample />);
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Hello **world**');
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByTestId('preview')).toHaveTextContent('Hello **world**');
    await user.click(screen.getByRole('tab', { name: 'Write' }));
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Hello **world**');
  });

  it('keeps the text on error and offers Try again', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ComposerExample onSubmit={onSubmit} error="Couldn't send. Your text is still here." />);
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Retry me');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send. Your text is still here.");
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onSubmit).toHaveBeenCalledWith('Retry me');
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Retry me');
  });

  it('does not send while sending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ComposerExample onSubmit={onSubmit} isSending />);
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Twice');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Sending…');
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('lets a mention picker take Enter first', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Composer
        value="@cl"
        onChange={() => {}}
        onSubmit={onSubmit}
        renderPreview={() => null}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />,
    );
    await user.click(screen.getByRole('textbox', { name: 'Comment' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('PickerPopover', () => {
  it('opens with the search focused, the none item first and a check on the current value', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    expect(screen.getByRole('searchbox')).toHaveFocus();
    const menu = screen.getByRole('menu', { name: 'Milestone' });
    const options = within(menu).getAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual([
      'No milestone',
      'PCI audit' + 'Oct 20',
      'Webhooks v2' + 'Nov 14✓',
      'SEPA Direct Debit' + 'Jan 30',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: /Webhooks v2/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('filters as you type and picks with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PickerExample onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('pci');
    const menu = screen.getByRole('menu', { name: 'Milestone' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('pci');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('clears the search on Escape, then closes on the next Escape', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('pc');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('returns null for the none item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PickerExample onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'No milestone' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the empty text when nothing matches', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});

describe('PickerList helpers', () => {
  it('moves the active item with wrap-around and skips disabled items', () => {
    expect(movePickerActive(ITEMS, null, 1)).toBe('pci');
    expect(movePickerActive(ITEMS, null, -1)).toBe('webhooks');
    expect(movePickerActive(ITEMS, 'pci', 1)).toBe('webhooks');
    expect(movePickerActive(ITEMS, 'webhooks', 1)).toBe('pci');
    expect(movePickerActive([], null, 1)).toBeNull();
  });

  it('filters case- and accent-insensitively', () => {
    const people: PickerItem[] = [
      { id: 'tomas', label: 'Tomás Berg' },
      { id: 'claude', label: 'claude-dev' },
    ];
    expect(filterPickerItems(people, 'toma').map((item) => item.id)).toEqual(['tomas']);
    expect(filterPickerItems(people, 'CL').map((item) => item.id)).toEqual(['claude']);
    expect(filterPickerItems(people, '')).toHaveLength(2);
  });

  it('PickerList exposes the active option for aria-activedescendant and selects on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PickerList
        id="mentions"
        aria-label="Mention"
        title="Mention · cl"
        items={ITEMS}
        activeId="webhooks"
        onSelect={onSelect}
      />,
    );
    const active = screen.getByRole('option', { name: /Webhooks v2/ });
    expect(active).toHaveAttribute('id', pickerOptionId('mentions', 'webhooks'));
    expect(active).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: /PCI audit/ }));
    expect(onSelect).toHaveBeenCalledWith('pci');
    await user.click(screen.getByRole('option', { name: /SEPA/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  it('runs its action and dismisses after the timeout', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast action={{ label: 'Undo', onAction }} kbd="⌘Z" timeout={5000} onDismiss={onDismiss}>
        PAY-140 moved to In review
      </Toast>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('PAY-140 moved to In review');
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('UserMenu', () => {
  it('switches the theme and runs menu actions', async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    const onSignOut = vi.fn();
    render(
      <UserMenu
        user={{ name: 'Ana Ruiz' }}
        subtitle="Admin · Reddevs"
        theme="system"
        onThemeChange={onThemeChange}
        groups={[
          [{ id: 'appearance', label: 'Appearance' }],
          [{ id: 'signout', label: 'Sign out', onAction: onSignOut }],
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ana Ruiz: account menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Account' });
    expect(dialog).toHaveTextContent('Admin · Reddevs');
    expect(within(dialog).getByRole('radio', { name: 'System' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Dark' }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(within(dialog).queryByText('Profile')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
