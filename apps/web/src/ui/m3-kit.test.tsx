import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Key } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { BacklogBlock, KeyValueRow, LabelChip, MissingTaskLink, TaskLink } from './BacklogBlock';
import { BoardColumn, ColumnRefusal } from './Board';
import { Checklist } from './Checklist';
import { ConnectionStatusTag, ProviderBadge } from './Connection';
import { CopyField } from './CopyField';
import { STATUS_ITEMS } from './gallery/m3-sample';
import { DisabledCreateButton, OwnedFieldCaption } from './Locked';
import { PropertyGrid } from './layout/PropertyGrid';
import { Rail } from './layout/Rail';
import { type MappingHow, MappingRow, MappingTable } from './Mapping';
import { ProblemList, ProblemRow } from './Problems';
import { SetupSteps } from './SetupSteps';
import { SourceButton, SourceStatusDot } from './SourceStatus';
import { NoticeStrip, SourceStrip, TruncatedPath } from './SourceStrip';
import { SystemActorAvatar, SystemActorDot } from './SystemActor';

const FILE = 'backlog/tasks/back-786 - Retry-failed-webhook-deliveries.md';

function MappingExample({ how = 'name', onChange }: { how?: MappingHow; onChange?: (key: Key) => void }) {
  const [value, setValue] = useState<Key>('todo');
  const [currentHow, setHow] = useState<MappingHow>(how);
  return (
    <MappingTable aria-label="Status mapping">
      <MappingRow
        from="Blocked"
        items={STATUS_ITEMS}
        value={value}
        how={currentHow}
        count={1234}
        onChange={(key) => {
          setValue(key);
          setHow('manual');
          onChange?.(key);
        }}
      />
    </MappingTable>
  );
}

describe('system actor', () => {
  it('is a named square, or decorative next to a visible name', () => {
    const { container, rerender } = render(<SystemActorAvatar size="lg" />);
    const avatar = screen.getByRole('img', { name: 'Backlog.md' });
    expect(avatar).toHaveTextContent('B');
    expect(avatar).toHaveAttribute('data-kind', 'system');
    rerender(<SystemActorAvatar decorative />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    rerender(<SystemActorDot />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('source state', () => {
  it('names each dot state', () => {
    render(
      <>
        <SourceStatusDot state="healthy" />
        <SourceStatusDot state="reading" />
        <SourceStatusDot state="warnings" />
        <SourceStatusDot state="failed" />
        <SourceStatusDot state="paused" />
        <SourceStatusDot state="detached" label="Detached on Oct 23" />
      </>,
    );
    for (const name of ['Healthy', 'Refreshing', 'Problems', 'Failed', 'Paused', 'Detached on Oct 23']) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
    }
  });

  it('SourceButton says the state and note, presses, and can be forced open', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const { rerender } = render(<SourceButton state="warnings" note="31 problems" onPress={onPress} />);
    const button = screen.getByRole('button', { name: /Problems.*Backlog\.md.*31 problems/ });
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).not.toHaveAttribute('data-open');
    rerender(<SourceButton state="healthy" note="3m ago" isOpen />);
    expect(screen.getByRole('button', { name: /Healthy/ })).toHaveAttribute('data-open', 'true');
  });
});

describe('connections', () => {
  it('ProviderBadge shows letters and names the provider', () => {
    render(
      <>
        <ProviderBadge provider="github" />
        <ProviderBadge provider="gitlab" size="sm" />
        <ProviderBadge provider="gitea" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'GitHub' })).toHaveTextContent('GH');
    expect(screen.getByRole('img', { name: 'GitLab' })).toHaveTextContent('GL');
    expect(screen.getByRole('img', { name: 'Gitea / Forgejo' })).toHaveTextContent('FJ');
  });

  it('ConnectionStatusTag labels every status, with or without the dot', () => {
    const { container, rerender } = render(<ConnectionStatusTag status="working" />);
    expect(container).toHaveTextContent('Working');
    rerender(<ConnectionStatusTag status="rejected" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'danger');
    expect(container).toHaveTextContent('Token rejected');
    rerender(<ConnectionStatusTag status="unreachable" withDot={false} />);
    expect(container).toHaveTextContent('Host unreachable');
    expect(container.querySelector('[data-state]')).toBeNull();
    rerender(<ConnectionStatusTag status="unchecked" />);
    expect(container).toHaveTextContent('Not checked');
  });
});

describe('locks', () => {
  it('OwnedFieldCaption defaults to "· file"', () => {
    render(<OwnedFieldCaption />);
    expect(screen.getByText('· file')).toBeInTheDocument();
  });

  it('PropertyGrid hatches locked cells and adds the caption note', () => {
    const { container } = render(
      <PropertyGrid
        items={[
          { id: 'status', label: 'Status', value: 'In progress', locked: true },
          { id: 'cycle', label: 'Cycle', value: 'Cycle 4' },
        ]}
      />,
    );
    const cells = container.querySelectorAll('dl > div');
    expect(cells[0]).toHaveAttribute('data-locked', 'true');
    expect(cells[0]).toHaveClass('locked-hatch');
    expect(cells[0]).toHaveTextContent('Status · file');
    expect(cells[1]).not.toHaveAttribute('data-locked');
  });

  it('DisabledCreateButton stays focusable and explains itself in a tooltip', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <DisabledCreateButton
        onPress={onPress}
        tooltip={
          <>
            Tasks in Payments come from Backlog.md. Add a file under <code>backlog/tasks/</code>.
          </>
        }
      />,
    );
    const button = screen.getByRole('button', { name: 'New' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Tasks in Payments come from Backlog.md.');
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('BoardColumn refuses with the default band, a string, or nothing', () => {
    const { rerender } = render(
      <BoardColumn status="in_review" count={3} refusal>
        <span>card</span>
      </BoardColumn>,
    );
    const column = screen.getByRole('region', { name: 'In review, 3 tasks' });
    expect(column).toHaveAttribute('data-refused', 'true');
    expect(within(column).getByRole('note')).toHaveTextContent(
      'Status comes from Backlog.md.Change it in the task file.',
    );
    rerender(
      <BoardColumn status="in_review" count={3} refusal="Not here.">
        <span>card</span>
      </BoardColumn>,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Not here.');
    rerender(
      <BoardColumn status="in_review" count={3}>
        <span>card</span>
      </BoardColumn>,
    );
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('region')).not.toHaveAttribute('data-refused');
  });

  it('ColumnRefusal takes custom text', () => {
    render(<ColumnRefusal>Milestones come from Backlog.md.</ColumnRefusal>);
    expect(screen.getByRole('note')).toHaveTextContent('Milestones come from Backlog.md.');
  });
});

describe('source strip and paths', () => {
  it('TruncatedPath keeps the full path in the title and cuts from the start by default', () => {
    const { container, rerender } = render(<TruncatedPath path={FILE} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span).toHaveAttribute('title', FILE);
    expect(span).toHaveAttribute('dir', 'rtl');
    expect(span.querySelector('bdi')).toHaveAttribute('dir', 'ltr');
    rerender(<TruncatedPath path={FILE} truncate="end" />);
    expect(container.firstElementChild).not.toHaveAttribute('dir');
  });

  it('SourceStrip shows the lead, the path and an external link', () => {
    render(
      <SourceStrip
        lead="Fields with a hatch come from"
        path={FILE}
        link={{ label: 'Open file', href: 'https://gitlab.com/reddevs/payments/-/blob/main/x.md' }}
      />,
    );
    expect(screen.getByText('Fields with a hatch come from')).toBeInTheDocument();
    expect(screen.getByTitle(FILE)).toHaveTextContent(FILE);
    const link = screen.getByRole('link', { name: 'Open file' });
    expect(link).toHaveAttribute('href', 'https://gitlab.com/reddevs/payments/-/blob/main/x.md');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('NoticeStrip draws marker, text and trailing content', () => {
    render(
      <NoticeStrip marker={<SourceStatusDot state="paused" />} trailing={<span>Listening…</span>}>
        <span>
          Last notification received: <b>never</b>
        </span>
      </NoticeStrip>,
    );
    expect(screen.getByRole('img', { name: 'Paused' })).toBeInTheDocument();
    expect(screen.getByText('never')).toBeInTheDocument();
    expect(screen.getByText('Listening…')).toBeInTheDocument();
  });
});

describe('Backlog.md block', () => {
  it('lists label and value rows with links and missing IDs', () => {
    render(
      <BacklogBlock backlogId="BACK-786" note="read-only · fields this app doesn’t have">
        <KeyValueRow label="Labels">
          <LabelChip>webhooks</LabelChip>
        </KeyValueRow>
        <KeyValueRow label="Depends on" layout="stack">
          <TaskLink taskKey="PAY-805" title="Signature check" status="in_progress" href="/p/PAY/PAY-805" />
          <MissingTaskLink backlogId="BACK-12" />
        </KeyValueRow>
      </BacklogBlock>,
    );
    const block = screen.getByRole('region', { name: 'Backlog.md BACK-786' });
    expect(block).toHaveTextContent('read-only · fields this app doesn’t have');
    expect(
      within(block)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Labels', 'Depends on']);
    expect(within(block).getByText('webhooks')).toBeInTheDocument();
    const link = within(block).getByRole('link', { name: /PAY-805.*Signature check/ });
    expect(link).toHaveAttribute('href', '/p/PAY/PAY-805');
    expect(within(block).getByText('no task with this ID')).toBeInTheDocument();
    expect(within(block).getByText('BACK-12')).toBeInTheDocument();
  });

  it('Checklist numbers items and says which are done, without controls', () => {
    render(
      <Checklist
        aria-label="Acceptance criteria"
        items={[
          { index: 1, text: 'Retries follow the schedule', checked: true },
          { index: 3, text: 'A 429 waits for Retry-After', checked: false },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Acceptance criteria' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('#1 Retries follow the schedule');
    expect(within(items[0] as HTMLElement).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByRole('img', { name: 'Not done' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('setup', () => {
  it('SetupSteps marks the current step and announces done ones', () => {
    render(
      <SetupSteps
        steps={[
          { id: 'mode', label: 'Mode', state: 'done', note: 'Mirror' },
          { id: 'source', label: 'Source', state: 'current' },
          { id: 'mappings', label: 'Mappings', state: 'todo' },
        ]}
      />,
    );
    const items = within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Mode');
    expect(items[0]).toHaveTextContent(', done');
    expect(items[0]).toHaveTextContent('Mirror');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveTextContent('3');
  });

  it('MappingRow shows how the value was picked and changes through the select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MappingExample how="fallback" onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Status mapping' });
    expect(within(group).getByText('In the files')).toBeInTheDocument();
    expect(within(group).getByText('1,234')).toBeInTheDocument();
    const trigger = within(group).getByRole('button', { name: /Todo/ });
    expect(trigger).toHaveAttribute('data-tone', 'warn');
    expect(trigger).toHaveTextContent('fallback');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /In review/ }));
    expect(onChange).toHaveBeenCalledWith('in_review');
    const updated = within(group).getByRole('button', { name: /In review/ });
    expect(updated).toHaveAttribute('data-tone', 'default');
    expect(updated).not.toHaveTextContent('fallback');
  });

  it('MappingRow by name says so; the summary variant has no select', () => {
    const { rerender } = render(
      <MappingTable aria-label="Status mapping">
        <MappingRow from="In Progress" items={STATUS_ITEMS} value="in_progress" how="name" count={9} />
      </MappingTable>,
    );
    expect(screen.getByRole('button', { name: /In progress/ })).toHaveTextContent('by name');
    rerender(
      <MappingTable aria-label="Status mapping" variant="summary">
        <MappingRow from="Blocked" items={STATUS_ITEMS} value="todo" how="fallback" count={2} isReadOnly />
      </MappingTable>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const group = screen.getByRole('group', { name: 'Status mapping' });
    expect(group).toHaveTextContent('Blocked');
    expect(group).toHaveTextContent('Todo');
    expect(group).toHaveTextContent('fallback');
    expect(within(group).queryByText('In the files')).toBeNull();
  });
});

describe('problems', () => {
  it('ProblemRow draws each layout with a named dot', () => {
    render(
      <ProblemList aria-label="Problems in the last refresh">
        <ProblemRow severity="error" file={FILE}>
          dependencies must be a flat list (line 9)
        </ProblemRow>
        <ProblemRow severity="error" file={FILE} layout="stacked">
          frontmatter is not valid YAML (line 4)
        </ProblemRow>
        <ProblemRow severity="warning">Status Blocked on 2 tasks shows as Todo.</ProblemRow>
        <ProblemRow severity="error" file="back-233.md" layout="inline">
          bad
        </ProblemRow>
      </ProblemList>,
    );
    const list = screen.getByRole('list', { name: 'Problems in the last refresh' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByRole('img', { name: 'Skipped' })).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByTitle(FILE)).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByRole('img', { name: 'Warning' })).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent('back-233.md · bad');
  });
});

describe('CopyField', () => {
  it('copies the value', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(<CopyField label="URL" value="https://example.test/hook" onCopy={onCopy} />);
    expect(screen.getByRole('group', { name: 'URL' })).toHaveTextContent('https://example.test/hook');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(await navigator.clipboard.readText()).toBe('https://example.test/hook');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('masks a secret until Show, and copies the real value', async () => {
    const user = userEvent.setup();
    render(<CopyField label="Secret token" value="whsec_real" maskedValue="whsec_…" />);
    const group = screen.getByRole('group', { name: 'Secret token' });
    expect(group).toHaveTextContent('whsec_…');
    expect(group).not.toHaveTextContent('whsec_real');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(group).toHaveTextContent('whsec_real');
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(group).not.toHaveTextContent('whsec_real');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe('whsec_real');
  });

  it('shows only the mask, without buttons, when there is no value', () => {
    render(<CopyField label="Secret token" maskedValue="whsec_…" />);
    expect(screen.getByRole('group', { name: 'Secret token' })).toHaveTextContent('whsec_…');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Rail', () => {
  it('marks mirrored projects', () => {
    render(
      <Rail
        workspace={{ name: 'Reddevs' }}
        user={{ name: 'Ana Ruiz' }}
        projects={[
          { key: 'PAY', name: 'Payments', openCount: 38, href: '/p/PAY', mirrored: true },
          { key: 'WEB', name: 'Web app', openCount: 27, href: '/p/WEB' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Payments, 38 open, mirrored from Backlog.md' })).toHaveAttribute(
      'data-mirrored',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Web app, 27 open' })).not.toHaveAttribute('data-mirrored');
  });
});
