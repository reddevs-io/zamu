import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Avatar, UnassignedAvatar } from '../Avatar';
import {
  BoardCard,
  BoardCardGhost,
  BoardCardSkeleton,
  BoardColumn,
  BoardColumnHeader,
  DropLine,
  SwimlaneHeader,
} from '../Board';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Comment, CommentBody, CommentDeleted } from '../Comment';
import { CommentEditor, Composer, type ComposerMode } from '../Composer';
import { cn } from '../cn';
import { Kbd } from '../Kbd';
import { type ThemeChoice, UserMenu } from '../layout/UserMenu';
import { MentionChip } from '../MentionChip';
import {
  filterPickerItems,
  movePickerActive,
  type PickerItem,
  PickerList,
  PickerPopover,
  pickerOptionId,
} from '../PickerPopover';
import { CycleGlyph, MilestoneGlyph, NoneGlyph } from '../PlanningGlyph';
import { DaysLeftPill, ProgressBar, TimeBar } from '../Progress';
import { SegmentedControl } from '../SegmentedControl';
import { StatStrip, StatTile } from '../Stat';
import { Toast } from '../Toast';
import { ViewTabs } from '../ViewTabs';
import { MEMBERS } from './sample';

/** /__ui sections for the M2 kit additions. Each demo shows the states the M2 screens need. */
export function M2Gallery() {
  return (
    <>
      <HeaderSection />
      <PlanningSection />
      <BoardSection />
      <CommentsSection />
      <PickersSection />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="m-0 border-b border-line pb-2 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="caps">{label}</span>
      {children}
    </div>
  );
}

// ── Project header ──────────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'tasks', label: 'Tasks', href: '/__ui', count: 12 },
  { id: 'milestones', label: 'Milestones', href: '/__ui', glyph: <MilestoneGlyph />, count: 3 },
  {
    id: 'cycles',
    label: 'Cycles',
    href: '/__ui',
    glyph: <CycleGlyph state="progress" progress={0.6} />,
    note: 'C12 · 3d left',
  },
];

function HeaderSection() {
  const [view, setView] = useState<'list' | 'board'>('board');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  return (
    <Section title="M2 · Project header">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="View tabs: both features, Tasks current">
          <div className="border border-line">
            <ViewTabs items={TABS} currentId="tasks" />
          </div>
        </Demo>
        <Demo label="View tabs: Cycles current, milestones off">
          <div className="border border-line">
            <ViewTabs items={TABS.filter((tab) => tab.id !== 'milestones')} currentId="cycles" />
          </div>
        </Demo>
        <Demo label="Segmented control (List / Board, with V hint)">
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-label="View"
              items={[
                { id: 'list', label: 'List' },
                { id: 'board', label: 'Board' },
              ]}
              value={view}
              onChange={setView}
            />
            <Kbd>V</Kbd>
            <span className="font-mono text-[11px] text-muted">{view}</span>
          </div>
        </Demo>
        <Demo label="Segmented control, full width (user menu), disabled">
          <div className="flex w-[256px] flex-col gap-2">
            <SegmentedControl
              aria-label="Theme"
              items={[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
                { id: 'system', label: 'System' },
              ]}
              value={theme}
              onChange={setTheme}
              fullWidth
            />
            <SegmentedControl
              aria-label="Theme (disabled)"
              items={[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
              ]}
              value="light"
              onChange={() => {}}
              isDisabled
            />
          </div>
        </Demo>
        <Demo label="User menu (rail avatar)">
          <div className="flex h-12 w-16 items-center justify-center bg-rail">
            <UserMenu
              user={{ name: 'Ana Ruiz', hue: 25 }}
              subtitle="Admin · Reddevs"
              theme={theme}
              onThemeChange={setTheme}
              groups={[
                [
                  { id: 'appearance', label: 'Appearance', href: '/__ui' },
                  {
                    id: 'workspace',
                    label: 'Switch workspace',
                    submenu: [
                      { id: 'reddevs', label: 'Reddevs', isCurrent: true },
                      { id: 'side', label: 'Side projects' },
                    ],
                  },
                ],
                [{ id: 'signout', label: 'Sign out', onAction: () => {} }],
              ]}
            />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

// ── Milestones and cycles ───────────────────────────────────────────────────────────────────────────

function PlanningSection() {
  return (
    <Section title="M2 · Milestones and cycles">
      <div className="grid grid-cols-3 gap-6">
        <Demo label="Glyphs">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="flex items-center gap-1.5">
              <MilestoneGlyph label="Planned milestone" />
              Planned
            </span>
            <span className="flex items-center gap-1.5">
              <MilestoneGlyph filled label="Active milestone" />
              Active
            </span>
            <MilestoneGlyph filled size={10} />
            <span className="flex items-center gap-1.5">
              <CycleGlyph label="Upcoming cycle" />
              Upcoming
            </span>
            <CycleGlyph state="progress" progress={0.25} />
            <CycleGlyph state="progress" progress={0.6} />
            <span className="flex items-center gap-1.5">
              <CycleGlyph state="progress" progress={0.79} size={14} className="text-accent" />
              Current
            </span>
            <span className="flex items-center gap-1.5">
              <CycleGlyph state="done" size={14} />
              Done
            </span>
            <NoneGlyph />
            <NoneGlyph shape="circle" />
          </div>
        </Demo>
        <Demo label="Chips (truncate at 150px)">
          <div className="flex flex-wrap items-center gap-[5px]">
            <Chip glyph={<MilestoneGlyph />}>
              Refunds rework for multi-currency invoices and partial captures
            </Chip>
            <Chip glyph={<MilestoneGlyph filled />}>Webhooks v2</Chip>
            <Chip glyph={<CycleGlyph />}>C12</Chip>
            <Chip glyph={<MilestoneGlyph />}>CLI 1.0</Chip>
          </div>
        </Demo>
        <Demo label="Days left">
          <div className="flex flex-wrap items-center gap-2">
            <DaysLeftPill daysLeft={12} />
            <DaysLeftPill daysLeft={3} />
            <DaysLeftPill daysLeft={1} />
            <DaysLeftPill daysLeft={0} />
            <DaysLeftPill daysLeft={2}>2d left</DaysLeftPill>
          </div>
        </Demo>
        <Demo label="Progress (rows, 4px)">
          <div className="flex w-[260px] flex-col gap-3">
            <ProgressBar done={10} inProgress={2} total={14} showCount />
            <ProgressBar done={14} inProgress={5} total={22} showCount />
            <ProgressBar done={0} total={9} showCount />
          </div>
        </Demo>
        <Demo label="Cycle bars (6px)" className="col-span-2">
          <div className="grid w-[560px] grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
            <span>Time</span>
            <TimeBar elapsedDays={11} totalDays={14} showCount />
            <span>Done</span>
            <ProgressBar size="md" done={9} inProgress={5} total={18} showCount />
          </div>
        </Demo>
        <Demo label="Stat strip, inset (current cycle card)" className="col-span-3">
          <div className="border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line-2 px-4 py-3.5">
              <CycleGlyph state="progress" progress={0.79} size={12} className="text-accent" />
              <span className="text-[15px] font-semibold">Cycle 12</span>
              <span className="text-muted">· Checkout rewrite</span>
              <span className="flex-1" />
              <span className="text-muted">Oct 12 – Oct 25</span>
              <DaysLeftPill daysLeft={3} />
            </div>
            <StatStrip variant="inset" aria-label="Cycle 12">
              <StatTile label="Scope" value={18} sub="3 added after start" />
              <StatTile label="Done" value={9} sub="50%" />
              <StatTile label="In progress" value={5} sub="1 in review" />
              <StatTile label="Todo" value={4} sub="2 unassigned" />
              <StatTile label="Agents" value={6} sub="of 18 tasks" />
            </StatStrip>
          </div>
        </Demo>
        <Demo label="Stat strip, boxed (completed cycle)" className="col-span-3">
          <StatStrip aria-label="Cycle 11">
            <StatTile label="Scope" value={20} sub="2 added after start" />
            <StatTile label="Completed" value={16} sub="80%" tone="done" />
            <StatTile label="Rolled over" value={3} sub="to Cycle 12" tone="warn" />
            <StatTile label="Canceled" value={1} sub="PAY-118" tone="muted" />
          </StatStrip>
        </Demo>
      </div>
    </Section>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────────────────────────────

const WEBHOOKS = { name: 'Webhooks v2', filled: true };
const REFUNDS = { name: 'Refunds rework for multi-currency invoices and partial captures' };
const C12 = { label: 'C12' };

function BoardSection() {
  const [folded, setFolded] = useState<Record<string, boolean>>({ done: true, canceled: true });
  const [lanes, setLanes] = useState<Record<string, boolean>>({ claude: true, tomas: false, none: true });
  const [toast, setToast] = useState(true);
  const fold = (id: string) => (next: boolean) => setFolded((prev) => ({ ...prev, [id]: next }));
  return (
    <Section title="M2 · Board">
      <Demo label="Card states">
        <div className="grid grid-cols-6 items-start gap-2.5">
          {(['default', 'hover', 'focus', 'selected', 'dragging'] as const).map((state) => (
            <div key={state} className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-faint">{state}</span>
              <BoardCard
                state={state}
                taskKey="PAY-131"
                title="Add idempotency keys to the refund endpoint"
                priority="urgent"
                milestone={WEBHOOKS}
                cycle={C12}
                assignee={MEMBERS.codex}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] text-faint">ghost</span>
            <BoardCardGhost />
          </div>
        </div>
      </Demo>
      <Demo label="Columns: open, drop target with line and ghost, long with “N more”, folded (press to expand)">
        <div className="relative flex h-[520px] w-[1200px] overflow-hidden border border-line bg-bg">
          {folded.backlog ? (
            <BoardColumn status="backlog" count={3} isFolded onFoldChange={fold('backlog')} />
          ) : (
            <BoardColumn status="backlog" count={3} onFoldChange={fold('backlog')} onAdd={() => {}}>
              <BoardCard
                taskKey="PAY-151"
                title="Support SEPA Direct Debit mandates"
                priority="low"
                milestone={REFUNDS}
              />
              <BoardCard
                taskKey="PAY-149"
                title="Evaluate moving payout files to S3 lifecycle rules"
                priority="none"
              />
            </BoardColumn>
          )}
          <BoardColumn status="todo" count={60} onAdd={() => {}} more="49 more · scroll or press J">
            <BoardCard
              taskKey="PAY-140"
              title="Partial refunds across more than three line items round to the wrong cent when the invoice currency differs from the account currency"
              priority="high"
              milestone={REFUNDS}
              cycle={C12}
              assignee={MEMBERS.tomas}
            />
            <BoardCard
              taskKey="PAY-137"
              title="Document the nightly payout reconciliation job"
              priority="none"
              cycle={C12}
              assignee={MEMBERS.claude}
            />
          </BoardColumn>
          <BoardColumn status="in_progress" count={3} onAdd={() => {}}>
            <BoardCard
              state="selected"
              taskKey="PAY-142"
              title="Retry failed webhook deliveries with exponential backoff"
              priority="high"
              milestone={WEBHOOKS}
              cycle={C12}
              assignee={MEMBERS.claude}
            />
            <BoardCardGhost />
            <BoardCard
              taskKey="PAY-139"
              title="Stream invoice PDFs instead of buffering them in memory"
              priority="medium"
              cycle={C12}
              assignee={MEMBERS.ana}
            />
          </BoardColumn>
          <BoardColumn status="in_review" count={2} onAdd={() => {}} isDropTarget>
            <BoardCard
              taskKey="PAY-138"
              title="Webhook signature check accepts expired timestamps"
              priority="urgent"
              milestone={WEBHOOKS}
              cycle={C12}
              assignee={MEMBERS.claude}
            />
            <DropLine />
            <BoardCard
              taskKey="PAY-135"
              title="Paginate the transactions CSV export"
              priority="medium"
              cycle={{ label: 'C11' }}
              assignee={MEMBERS.tomas}
            />
          </BoardColumn>
          {(['done', 'canceled'] as const).map((status) =>
            folded[status] ? (
              <BoardColumn
                key={status}
                status={status}
                count={status === 'done' ? 64 : 3}
                isFolded
                onFoldChange={fold(status)}
              />
            ) : (
              <BoardColumn
                key={status}
                status={status}
                count={status === 'done' ? 64 : 3}
                onFoldChange={fold(status)}
              >
                <BoardCard taskKey="PAY-118" title="Drop the legacy refund webhook" priority="low" />
              </BoardColumn>
            ),
          )}
          <BoardCard
            state="dragging"
            className="absolute top-[300px] left-[640px] w-[262px]"
            taskKey="PAY-131"
            title="Add idempotency keys to the refund endpoint"
            priority="urgent"
            milestone={WEBHOOKS}
            cycle={C12}
            assignee={MEMBERS.codex}
          />
          {toast ? (
            <Toast
              floating
              action={{ label: 'Undo', onAction: () => setToast(false) }}
              kbd="⌘Z"
              timeout={undefined}
            >
              PAY-140 moved to In review
            </Toast>
          ) : null}
        </div>
        <Button variant="secondary" size="sm" className="self-start" onPress={() => setToast(true)}>
          Show toast again
        </Button>
      </Demo>
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Swimlanes (press a lane to collapse)">
          <div className="flex w-[580px] flex-col border border-line">
            <div className="flex">
              <BoardColumnHeader status="todo" count={4} className="flex-1 border-r" />
              <BoardColumnHeader status="in_progress" count={3} className="flex-1" />
            </div>
            <SwimlaneHeader
              title="claude-dev"
              lead={<Avatar {...MEMBERS.claude} decorative />}
              sub="for Ana Ruiz"
              count={3}
              isOpen={lanes.claude ?? false}
              onOpenChange={(open) => setLanes((prev) => ({ ...prev, claude: open }))}
            />
            {lanes.claude ? (
              <div className="flex">
                <div className="flex flex-1 flex-col gap-1.5 border-r border-line-2 p-2">
                  <BoardCard
                    taskKey="PAY-137"
                    title="Document the nightly payout reconciliation job"
                    priority="none"
                    cycle={C12}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                  <BoardCard
                    taskKey="PAY-142"
                    title="Retry failed webhook deliveries with exponential backoff"
                    priority="high"
                    milestone={WEBHOOKS}
                    cycle={C12}
                  />
                </div>
              </div>
            ) : null}
            <SwimlaneHeader
              title="Tomás Berg"
              lead={<Avatar {...MEMBERS.tomas} decorative />}
              count={3}
              isOpen={lanes.tomas ?? false}
              onOpenChange={(open) => setLanes((prev) => ({ ...prev, tomas: open }))}
            />
            <SwimlaneHeader
              title="No assignee"
              count={4}
              isOpen={lanes.none ?? false}
              onOpenChange={(open) => setLanes((prev) => ({ ...prev, none: open }))}
            />
            <SwimlaneHeader title="Webhooks v2" lead={<MilestoneGlyph filled />} count={5} isOpen={false} />
            <SwimlaneHeader title="No milestone" lead={<NoneGlyph />} count={7} isOpen={false} />
          </div>
        </Demo>
        <Demo label="Loading column, unassigned avatar">
          <div className="flex h-[260px] w-[300px] border border-line">
            <div className="flex flex-1 flex-col gap-1.5 p-2" aria-busy>
              <BoardCardSkeleton titleWidth="70%" />
              <BoardCardSkeleton titleWidth="50%" />
              <BoardCardSkeleton titleWidth="80%" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <UnassignedAvatar /> Unassigned
            <UnassignedAvatar size="md" />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

// ── Comments ────────────────────────────────────────────────────────────────────────────────────────

const MENTIONABLE: (PickerItem & { kind: 'person' | 'agent' })[] = [
  {
    id: 'claude',
    label: 'claude-dev',
    kind: 'agent',
    sub: 'agent · for Ana Ruiz',
    lead: <Avatar {...MEMBERS.claude} decorative />,
  },
  {
    id: 'claude-review',
    label: 'claude-review',
    kind: 'agent',
    sub: 'agent · for Tomás Berg',
    lead: <Avatar name="claude-review" kind="agent" decorative />,
  },
  {
    id: 'clara',
    label: 'Clara Lindqvist',
    kind: 'person',
    sub: 'person',
    lead: <Avatar name="Clara Lindqvist" hue={145} decorative />,
  },
  {
    id: 'ana',
    label: 'Ana Ruiz',
    kind: 'person',
    sub: 'person',
    lead: <Avatar {...MEMBERS.ana} decorative />,
  },
];

const markdownComponents: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith('mention:')) {
      const member = MENTIONABLE.find((item) => item.id === href.slice('mention:'.length));
      return <MentionChip name={member?.label ?? String(children)} kind={member?.kind} />;
    }
    return <a href={href}>{children}</a>;
  },
};

function renderMarkdown(text: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
      urlTransform={(url) => (url.startsWith('mention:') ? url : defaultUrlTransform(url))}
    >
      {text}
    </ReactMarkdown>
  );
}

/** The @token right before the caret, if any. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@[\]]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - (match[2]?.length ?? 0) - 1, query: match[2] ?? '' };
}

function ComposerDemo() {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<ComposerMode>('write');
  const [sent, setSent] = useState<string[]>([]);
  const [caret, setCaret] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const mention = dismissed ? null : mentionAt(value, caret);
  const matches = mention ? filterPickerItems(MENTIONABLE, mention.query) : [];
  const isOpen = mention != null && mode === 'write';
  const listId = 'gallery-mentions';
  const active = matches.find((item) => item.id === activeId)?.id ?? matches[0]?.id ?? null;

  const insert = (id: string) => {
    const member = MENTIONABLE.find((item) => item.id === id);
    if (!member || !mention) return;
    const link = `[@${member.label}](mention:${member.id}) `;
    const next = value.slice(0, mention.start) + link + value.slice(caret);
    const nextCaret = mention.start + link.length;
    setValue(next);
    setCaret(nextCaret);
    requestAnimationFrame(() => ref.current?.setSelectionRange(nextCaret, nextCaret));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveId(movePickerActive(matches, active, event.key === 'ArrowDown' ? 1 : -1));
    } else if ((event.key === 'Enter' || event.key === 'Tab') && active && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      insert(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Composer
        value={value}
        onChange={(next) => {
          setValue(next);
          setDismissed(false);
        }}
        onSubmit={() => {
          setSent((prev) => [...prev, value]);
          setValue('');
        }}
        mode={mode}
        onModeChange={setMode}
        renderPreview={renderMarkdown}
        textAreaRef={ref}
        onKeyDown={onKeyDown}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        textAreaProps={{
          'aria-controls': isOpen ? listId : undefined,
          'aria-expanded': isOpen,
          'aria-autocomplete': 'list',
          'aria-activedescendant': isOpen && active ? pickerOptionId(listId, active) : undefined,
        }}
        overlay={
          isOpen ? (
            <PickerList
              id={listId}
              aria-label="Mention"
              title={`Mention · ${mention?.query || '…'}`}
              items={matches}
              activeId={active}
              onActiveChange={setActiveId}
              onSelect={insert}
              footer="No notifications yet. A mention links to the member."
              className="absolute bottom-full left-0 mb-1 w-80"
            />
          ) : null
        }
      />
      <span className="font-mono text-[10.5px] text-faint" data-testid="composer-sent">
        Sent: {sent.length ? sent[sent.length - 1] : 'nothing yet'}
      </span>
    </div>
  );
}

function CommentsSection() {
  const [own, setOwn] = useState({ text: 'No, honour Retry-After and don’t count it.', deleted: false });
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Section title="M2 · Comments">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Thread: edited, own (Edit, Delete with confirmation), agent, deleted">
          <div className="flex flex-col gap-2.5">
            <Comment author={MEMBERS.tomas} time="32m" isEdited>
              <CommentBody>
                <p>
                  Should 429 count toward the 6 attempts? Some providers send it for minutes during deploys.
                </p>
              </CommentBody>
            </Comment>
            {own.deleted ? (
              <CommentDeleted by="Ana Ruiz" time="now" />
            ) : (
              <Comment
                author={MEMBERS.ana}
                time="28m"
                isOwn
                onEdit={() => setEditing(own.text)}
                onDelete={() => setOwn((prev) => ({ ...prev, deleted: true }))}
                editor={
                  editing != null ? (
                    <CommentEditor
                      value={editing}
                      onChange={setEditing}
                      onCancel={() => setEditing(null)}
                      onSave={() => {
                        setOwn({ text: editing, deleted: false });
                        setEditing(null);
                      }}
                    />
                  ) : undefined
                }
              >
                <CommentBody>
                  <p>
                    {own.text} <MentionChip name="claude-dev" kind="agent" href="/__ui" /> can you cover that
                    in the tests?
                  </p>
                </CommentBody>
              </Comment>
            )}
            <CommentDeleted by="Tomás Berg" time="1h" />
            <Comment author={MEMBERS.claude} onBehalfOf="Ana Ruiz" time="3m">
              {renderBody(AGENT_COMMENT)}
            </Comment>
          </div>
        </Demo>
        <Demo label="Editing in place, mention chips">
          <div className="flex flex-col gap-2.5">
            <Comment
              author={MEMBERS.ana}
              time="28m"
              isOwn
              editor={
                <CommentEditor
                  value="No, honour Retry-After and don't count it. @claude-dev can you cover that in the tests, including a 429 with no header?"
                  onChange={() => {}}
                  onSave={() => {}}
                  onCancel={() => {}}
                  autoFocus={false}
                />
              }
            />
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <MentionChip name="Ana Ruiz" />
              <MentionChip name="claude-dev" kind="agent" />
              <MentionChip name="codex-ci" kind="agent" initials="X" href="/__ui" />
            </div>
          </div>
        </Demo>
        <Demo label="Composer: type @cl for the mention picker, ⌘↵ sends">
          <div className="pt-[190px]">
            <ComposerDemo />
          </div>
        </Demo>
        <Demo label="Composer: preview and sending, failed (text kept)">
          <div className="flex flex-col gap-3">
            <Composer
              value="Can you add a test for the 429 case? [@claude-dev](mention:claude) The provider sends `Retry-After` in seconds."
              onChange={() => {}}
              onSubmit={() => {}}
              defaultMode="preview"
              renderPreview={renderMarkdown}
              isSending
            />
            <Composer
              value="Can you add a test for the 429 case? [@claude-dev](mention:claude) The provider sends `Retry-After` in seconds."
              onChange={() => {}}
              onSubmit={() => {}}
              defaultMode="preview"
              renderPreview={renderMarkdown}
              error="Couldn't send. Your text is still here."
            />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

const AGENT_COMMENT = `Done. Retries now run as pg-boss jobs:

\`\`\`
attempt  delay      status
1        30s        503
2        1m 4s      timeout
3        2m 9s      429 (Retry-After 120s, not counted)
\`\`\`

- 4xx stops retrying, except 408 and 429
- 429 waits for Retry-After and does not use an attempt
- Tests: 14 new cases in \`delivery-retry.test.ts\``;

function renderBody(text: string) {
  return <CommentBody>{renderMarkdown(text)}</CommentBody>;
}

// ── Pickers ─────────────────────────────────────────────────────────────────────────────────────────

const MILESTONES: PickerItem[] = [
  { id: 'pci', label: 'PCI audit', lead: <MilestoneGlyph filled />, meta: 'Oct 20', metaTone: 'warn' },
  { id: 'webhooks', label: 'Webhooks v2', lead: <MilestoneGlyph filled />, meta: 'Nov 14' },
  {
    id: 'refunds',
    label: 'Refunds rework for multi-currency invoices',
    lead: <MilestoneGlyph />,
    meta: '–',
  },
  { id: 'sepa', label: 'SEPA Direct Debit', lead: <MilestoneGlyph />, meta: 'Jan 30' },
];

const CYCLES: PickerItem[] = [
  {
    id: 'c12',
    label: 'Cycle 12',
    lead: <CycleGlyph state="progress" progress={0.79} />,
    sub: 'current · 3d left',
  },
  { id: 'c13', label: 'Cycle 13', lead: <CycleGlyph />, sub: 'Oct 26 – Nov 8' },
  { id: 'c14', label: 'Cycle 14', lead: <CycleGlyph />, sub: 'Nov 9 – Nov 22' },
];

function PickersSection() {
  const [milestone, setMilestone] = useState<string | null>('webhooks');
  const [cycle, setCycle] = useState<string | null>(null);
  const currentMilestone = MILESTONES.find((item) => item.id === milestone);
  const currentCycle = CYCLES.find((item) => item.id === cycle);
  return (
    <Section title="M2 · Pickers">
      <div className="grid grid-cols-3 gap-6">
        <Demo label="Milestone picker (press, type to filter)">
          <PickerPopover
            aria-label="Milestone"
            items={MILESTONES}
            value={milestone}
            onChange={setMilestone}
            none={{ label: 'No milestone', glyph: <NoneGlyph /> }}
            searchPlaceholder="Set milestone…"
            kbd="⇧M"
          >
            <Button variant="secondary" className="self-start">
              {currentMilestone ? currentMilestone.lead : <NoneGlyph />}
              {currentMilestone?.label ?? 'No milestone'}
            </Button>
          </PickerPopover>
        </Demo>
        <Demo label="Cycle picker">
          <PickerPopover
            aria-label="Cycle"
            items={CYCLES}
            value={cycle}
            onChange={setCycle}
            none={{ label: 'No cycle', glyph: <NoneGlyph shape="circle" /> }}
            searchPlaceholder="Set cycle…"
            kbd="⇧C"
            width={280}
          >
            <Button variant="secondary" className="self-start">
              {currentCycle ? currentCycle.lead : <NoneGlyph shape="circle" />}
              {currentCycle?.label ?? 'No cycle'}
            </Button>
          </PickerPopover>
        </Demo>
        <Demo label="Picker list (static, mention style)">
          <PickerList
            aria-label="Mention"
            title="Mention · cl"
            items={MENTIONABLE.slice(0, 3)}
            activeId="claude"
            onSelect={() => {}}
            footer="No notifications yet. A mention links to the member."
            className="w-80"
          />
        </Demo>
      </div>
    </Section>
  );
}
