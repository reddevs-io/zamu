import { type ReactNode, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Avatar, MemberLabel, UnassignedAvatar } from '../Avatar';
import { Banner, ReadOnlyNote } from '../Banner';
import { Button } from '../Button';
import { Calendar } from '../Calendar';
import { CheckboxBox } from '../Checkbox';
import { ColorSwatches } from '../ColorSwatches';
import { cn } from '../cn';
import { ConfirmBody, ConfirmDialog, DialogFooter, DialogSurface, Scrim } from '../Dialog';
import { DueChip } from '../DueChip';
import { EmptyState } from '../EmptyState';
import { FiltersGlyph, LockGlyph } from '../Glyphs';
import { KeyHint } from '../Kbd';
import { LabelChip, LabelDot, LabelOverflow } from '../LabelChip';
import { BlockedMarker, BlockedNotice, SubtaskProgress } from '../Markers';
import type { TaskStatus } from '../meta';
import { MenuRowButton, PickerMenu, type PickerMenuItem, PickerMenuPopover } from '../PickerMenu';
import { Pill } from '../Pill';
import { PriorityGlyph } from '../PriorityGlyph';
import { ProgressBar, SegmentedBar, SegmentLegend } from '../Progress';
import { SegmentedControl } from '../SegmentedControl';
import { Select } from '../Select';
import { Skeleton, SkeletonCard, SkeletonRows } from '../Skeleton';
import { SourceBadge } from '../SourceBadge';
import { StatusGlyph } from '../StatusGlyph';
import { Switch } from '../Switch';
import { Tab, TabList, Tabs } from '../Tabs';
import { TextField } from '../TextField';
import { Toast } from '../Toast';
import { TooltipChip } from '../Tooltip';

/**
 * /__ui: the M5 Margin kit, laid out like .agent/design/m5/round2/screens/001-kit-kit-light-all.png and
 * 002-kit-kit-dark-all.png (1440 wide), once per theme, then the pickers, calendar, swatches and dialogs the
 * frames don't show. Hover and keyboard-focus cells force the look with classes; everything else is the
 * component as screens use it. Cards and list rows are sample markup built from kit pieces: the board (M5-12)
 * and list (M5-11) own the real ones.
 */
export function M5Gallery() {
  return (
    <section aria-label="M5 · Margin kit" data-frame="m5" className="flex flex-col">
      <KitFrame theme="light" />
      <KitFrame theme="dark" />
      <ExtrasFrame theme="light" />
      <ExtrasFrame theme="dark" />
    </section>
  );
}

const TODAY = '2026-11-03';

// ── Frame shell ──────────────────────────────────────────────────────────────────────────────────────────

function KitFrame({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      id={`m5-kit-${theme}`}
      data-frame={`m5-kit-${theme}`}
      className={cn(
        theme,
        'grid w-[1440px] grid-cols-2 gap-x-10 gap-y-7 bg-bg px-10 pt-8 pb-10 font-sans text-md text-fg',
      )}
    >
      <div className="col-span-2 flex items-baseline gap-4">
        <h2 className="m-0 font-serif text-2xl font-medium">Kit</h2>
        <span className="text-fg-3">
          {theme === 'dark' ? 'Dark' : 'Light'} · Onest for UI and keys, Newsreader for titles · every
          component in its states
        </span>
      </div>
      <ButtonsSection />
      <InputsSection />
      <StatusSection />
      <AvatarsSection />
      <ChipsSection />
      <CardsSection />
      <RowsSection />
      <MenuSection />
      <ErrorEmptySection />
    </div>
  );
}

function Sec({ title, full, children }: { title: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', full && 'col-span-2')}>
      <div className="text-sm font-semibold text-fg-3">{title}</div>
      {children}
    </div>
  );
}

function Cap({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-xs text-fg-3', className)}>{children}</span>;
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>;
}

// ── Buttons ──────────────────────────────────────────────────────────────────────────────────────────────

/** Classes that draw the hover look on a static demo (React Aria sets data-hovered only on real hover). */
const HOVER = {
  primary: 'bg-[color-mix(in_oklch,var(--accent)_88%,var(--fg))]',
  secondary: 'bg-bg-lane text-fg',
  quiet: 'bg-bg-lane text-fg',
  danger: 'bg-[color-mix(in_oklch,var(--danger)_88%,var(--fg))]',
} as const;
const FOCUS = 'shadow-[var(--focus-ring)]';

function ButtonsSection() {
  const rows: { label: string; variant: keyof typeof HOVER; text: ReactNode; kbd?: string }[] = [
    { label: 'Primary', variant: 'primary', text: 'New task', kbd: 'C' },
    { label: 'Secondary', variant: 'secondary', text: 'Copy link' },
    {
      label: 'Quiet',
      variant: 'quiet',
      text: (
        <>
          <FiltersGlyph />
          Filter
        </>
      ),
    },
    { label: 'Danger', variant: 'danger', text: 'Delete label' },
  ];
  return (
    <Sec title="Buttons">
      <div className="grid grid-cols-[90px_repeat(4,minmax(0,1fr))] items-center gap-x-3.5 gap-y-2.5">
        <span />
        <Cap>Default</Cap>
        <Cap>Hover</Cap>
        <Cap>Keyboard focus</Cap>
        <Cap>Disabled</Cap>
        {rows.map((row) => (
          <ButtonRow key={row.label} {...row} />
        ))}
      </div>
    </Sec>
  );
}

function ButtonRow({
  label,
  variant,
  text,
  kbd,
}: {
  label: string;
  variant: keyof typeof HOVER;
  text: ReactNode;
  kbd?: string;
}) {
  return (
    <>
      <Cap>{label}</Cap>
      <span>
        <Button variant={variant} kbd={kbd}>
          {text}
        </Button>
      </span>
      <span>
        <Button variant={variant} kbd={kbd} className={HOVER[variant]}>
          {text}
        </Button>
      </span>
      <span>
        <Button variant={variant} kbd={kbd} className={FOCUS}>
          {text}
        </Button>
      </span>
      <span>
        <Button variant={variant} kbd={kbd} isDisabled>
          {text}
        </Button>
      </span>
    </>
  );
}

// ── Inputs and controls ──────────────────────────────────────────────────────────────────────────────────

function InputsSection() {
  const [view, setView] = useState<'list' | 'board'>('board');
  return (
    <Sec title="Inputs and controls">
      <div className="grid grid-cols-3 items-center gap-x-3.5 gap-y-2.5">
        <TextField label="Default" placeholder="Project name" aria-label="Default" />
        <TextField
          label="Keyboard focus"
          defaultValue="Harb"
          inputClassName="border-accent shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <TextField
          label="Error"
          defaultValue="harbor"
          isInvalid
          errorMessage="A project key is 2 to 5 capital letters."
        />
        <TextField label="Disabled" defaultValue="HBR" isDisabled />
        <TextField label="Read-only (mirrored)" defaultValue="needs-owner" locked />
        <Select
          label="Select"
          aria-label="Group by"
          defaultValue="priority"
          items={[
            { id: 'priority', label: 'Priority' },
            { id: 'status', label: 'Status' },
          ]}
        />
      </div>
      <Row>
        <Switch aria-label="Off" />
        <Switch aria-label="On" defaultSelected />
        <CheckboxBox checked={false} />
        <CheckboxBox checked />
        <SegmentedControl
          aria-label="View"
          items={[
            { id: 'list', label: 'List' },
            { id: 'board', label: 'Board' },
          ]}
          value={view}
          onChange={setView}
        />
        <Tabs defaultSelectedKey="mine">
          <TabList aria-label="Home">
            <Tab id="mine" count={7}>
              Mine
            </Tab>
            <Tab id="everyone">Everyone</Tab>
            <Tab id="agents">Agents</Tab>
          </TabList>
        </Tabs>
      </Row>
    </Sec>
  );
}

// ── Status, priority, avatars ────────────────────────────────────────────────────────────────────────────

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];

function StatusSection() {
  return (
    <Sec title="Status and priority">
      <Row>
        {STATUSES.map((status) => (
          <StatusGlyph key={status} status={status} withLabel className="text-md" />
        ))}
      </Row>
      <Row>
        {(['urgent', 'high', 'medium', 'low', 'none'] as const).map((priority) => (
          <PriorityGlyph key={priority} priority={priority} withLabel />
        ))}
        <Cap>Cards and rows show only Urgent and High.</Cap>
      </Row>
    </Sec>
  );
}

function AvatarsSection() {
  return (
    <Sec title="Avatars">
      <Row>
        <Avatar name="Ana Ruiz" hue={30} />
        <Avatar name="Tomás Ferrer" hue={160} />
        <Avatar name="claude-dev" kind="agent" />
        <Avatar name="review-bot" kind="agent" hue={250} />
        <UnassignedAvatar />
        <Avatar name="Ana Ruiz" hue={30} size={22} />
        <Avatar name="claude-dev" kind="agent" size={22} />
        <Avatar name="Ana Ruiz" hue={30} size={28} />
        <span className="flex items-center gap-1.5">
          <MemberLabel
            name="claude-dev"
            kind="agent"
            onBehalfOf="Ana"
            className="[&>span:nth-child(2)]:font-medium"
          />
        </span>
      </Row>
      <Cap>People are round, agents square. Your own avatar is hidden on cards.</Cap>
    </Sec>
  );
}

// ── Chips and markers ────────────────────────────────────────────────────────────────────────────────────

const LABELS: [string, number][] = [
  ['frontend', 1],
  ['backend', 2],
  ['mobile', 3],
  ['security', 4],
  ['infra', 5],
  ['i18n', 6],
  ['needs-owner', 7],
  ['design', 8],
  ['perf', 9],
];

function ChipsSection() {
  return (
    <Sec title="Chips and markers" full>
      <Row>
        {LABELS.map(([name, color]) => (
          <LabelChip key={name} name={name} color={color} />
        ))}
        <Cap className="ml-3">Label chip:</Cap>
        <LabelChip name="default" color={3} />
        <LabelChip name="hover" color={3} className="bg-line-soft text-fg" />
        <LabelChip name="focus" color={3} className={FOCUS} />
        <LabelChip name="mirrored" color={3} locked />
        <Skeleton width={64} height={20} className="rounded-pill" />
      </Row>
      <Row>
        <Cap>Due</Cap>
        <DueChip dueDate="2026-11-14" status="todo" today={TODAY} />
        <DueChip dueDate="2026-11-04" status="todo" today={TODAY} />
        <DueChip dueDate="2026-11-03" status="todo" today={TODAY} />
        <DueChip dueDate="2026-10-31" status="todo" today={TODAY} />
        <DueChip dueDate="2026-10-02" status="done" today={TODAY} />
        <Cap className="ml-3">Blocked</Cap>
        <BlockedMarker count={2} />
        <Cap className="ml-3">Subtasks</Cap>
        <SubtaskProgress done={0} total={4} />
        <SubtaskProgress done={2} total={7} />
        <SubtaskProgress done={3} total={4} />
        <SubtaskProgress done={5} total={5} />
        <Cap className="ml-3">Pills</Cap>
        <Pill>in review</Pill>
        <Pill tone="warn">blocked</Pill>
        <Pill tone="accent">mentions you</Pill>
        <Pill tone="ok">done</Pill>
        <Cap className="ml-3">Source</Cap>
        <SourceBadge sync="synced" />
        <SourceBadge sync="syncing" />
        <SourceBadge sync="failed" />
      </Row>
    </Sec>
  );
}

// ── Cards (sample markup) ────────────────────────────────────────────────────────────────────────────────

function SampleCard({
  state = 'default',
  title,
  taskKey = 'HBR-181',
  agent = true,
  locked = false,
  children,
  full = false,
}: {
  state?: 'default' | 'hover' | 'focus' | 'selected';
  title: string;
  taskKey?: string;
  agent?: boolean;
  locked?: boolean;
  children?: ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 rounded-md bg-surface px-3.25 py-2.75 shadow-card',
        state === 'hover' && 'bg-surface-hover',
        state === 'focus' && 'shadow-[0_0_0_2px_var(--accent),var(--shadow-card)]',
        state === 'selected' && 'bg-accent-soft shadow-[0_0_0_2px_var(--accent),var(--shadow-card)]',
      )}
    >
      {agent ? (
        <Avatar name="claude-dev" kind="agent" decorative className="absolute top-2.75 right-3" />
      ) : null}
      {locked ? <LockGlyph className="absolute top-3.25 right-3 text-fg-3" /> : null}
      <div className={cn('pr-6 font-medium text-pretty text-fg', full ? 'line-clamp-4' : 'line-clamp-2')}>
        {title}
      </div>
      <div className="flex min-h-5 flex-wrap items-center gap-1.5 gap-y-1.25">
        {children ?? (
          <>
            <PriorityGlyph priority="high" context="compact" />
            <Key>{taskKey}</Key>
            <LabelChip name="backend" color={2} surface="lane" />
          </>
        )}
      </div>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium whitespace-nowrap text-fg-3 tabular-nums">{children}</span>;
}

function Lane({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 rounded-lg bg-bg-lane p-2.5', className)}>{children}</div>;
}

function CardsSection() {
  const title = 'Retry webhook deliveries with backoff';
  return (
    <Sec title="Cards" full>
      <div className="grid grid-cols-4 items-start gap-x-3.5 gap-y-2.5">
        {(
          [
            ['Default', 'default'],
            ['Hover', 'hover'],
            ['Keyboard focus (J/K)', 'focus'],
            ['Selected (X)', 'selected'],
          ] as const
        ).map(([caption, state]) => (
          <div key={state} className="flex flex-col gap-1.5">
            <Cap>{caption}</Cap>
            <Lane>
              <SampleCard state={state} title={title} />
            </Lane>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Cap>Mirrored, hover (fields locked)</Cap>
          <Lane>
            <SampleCard
              state="hover"
              title="Store release 1.22.0 with the offline cache"
              agent={false}
              locked
            >
              <PriorityGlyph priority="high" context="compact" />
              <Key>HBR-193</Key>
              <LabelChip name="mobile" color={3} surface="lane" />
              <span className="flex-1" />
              <BlockedMarker />
              <DueChip dueDate="2026-11-14" status="todo" today={TODAY} />
            </SampleCard>
          </Lane>
        </div>
        <div className="flex flex-col gap-1.5">
          <Cap>Loading</Cap>
          <Lane>
            <SkeletonCard />
          </Lane>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Cap>Everything set (urgent, 3 labels, subtasks, blocked, overdue, agent)</Cap>
          <Lane className="max-w-90">
            <SampleCard
              full
              title="Reconcile pending card transactions that settle with a different amount, currency or merchant name after the authorisation window closes"
            >
              <PriorityGlyph priority="urgent" context="compact" />
              <Key>HBR-201</Key>
              <LabelChip name="backend" color={2} surface="lane" />
              <LabelChip name="security" color={4} surface="lane" />
              <LabelOverflow count={1} names={['perf']} />
              <span className="flex-1" />
              <BlockedMarker count={1} />
              <SubtaskProgress done={3} total={5} />
              <DueChip dueDate="2026-10-31" status="in_progress" today={TODAY} />
            </SampleCard>
          </Lane>
        </div>
      </div>
    </Sec>
  );
}

// ── List rows (sample markup) ────────────────────────────────────────────────────────────────────────────

function SampleRow({ state }: { state: 'default' | 'hover' | 'keyboard focus' | 'selected' }) {
  return (
    <div
      className={cn(
        'flex h-(--row-h) items-center gap-2.5 pr-4.5 pl-4 whitespace-nowrap',
        state === 'hover' && 'bg-surface-hover',
        (state === 'keyboard focus' || state === 'selected') && 'bg-accent-soft',
      )}
    >
      {state === 'selected' ? <CheckboxBox checked className="-mr-0.5" /> : null}
      <PriorityGlyph priority="high" context="compact" />
      <span className="w-15.5 shrink-0">
        <Key>HBR-181</Key>
      </span>
      <StatusGlyph status="in_review" />
      <span className="min-w-0 flex-1 truncate text-fg">Retry webhook deliveries with backoff</span>
      <span className="flex shrink-0 items-center gap-2">
        <LabelChip name="backend" color={2} />
        <Avatar name="claude-dev" kind="agent" decorative />
        <span className="w-10 text-right text-xs text-fg-3 tabular-nums">3h</span>
      </span>
      <Cap className="w-27.5 text-right">{state}</Cap>
    </div>
  );
}

function RowsSection() {
  return (
    <Sec title="List rows" full>
      <div className="overflow-hidden rounded-md border border-line-soft">
        <SampleRow state="default" />
        <SampleRow state="hover" />
        <SampleRow state="keyboard focus" />
        <SampleRow state="selected" />
        <div className="flex h-(--row-h) items-center gap-2.5 pr-4.5 pl-4">
          <Skeleton width={14} />
          <Skeleton width={54} />
          <Skeleton round height={13} />
          <Skeleton width="45%" />
          <span className="flex-1" />
          <Skeleton width={60} />
          <Skeleton round height={18} />
          <Cap className="w-27.5 text-right">loading</Cap>
        </div>
      </div>
    </Sec>
  );
}

// ── Menu, tooltip, toast ─────────────────────────────────────────────────────────────────────────────────

const STATUS_ITEMS: PickerMenuItem[] = STATUSES.map((status, index) => ({
  id: status,
  label: {
    backlog: 'Backlog',
    todo: 'Todo',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done',
    canceled: 'Canceled',
  }[status],
  lead: <StatusGlyph status={status} decorative />,
  numberKey: String(index + 1),
  tone: status === 'canceled' ? 'dim' : 'default',
}));

/** A static menu panel: --surface-pop, radius lg, --shadow-pop (the popover's look without a popover). */
function MenuPanel({
  width,
  children,
  className,
}: {
  width: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col rounded-lg bg-surface-pop shadow-pop', className)} style={{ width }}>
      {children}
    </div>
  );
}

function MenuSection() {
  return (
    <Sec title="Menu, tooltip, toast">
      <div className="flex items-start gap-6">
        {/* The highlighted row is forced here; in use it follows the arrow keys and the pointer. */}
        <MenuPanel width={260} className="[&_[data-key$=progress]]:bg-bg-lane">
          <PickerMenu
            aria-label="Status (sample)"
            items={STATUS_ITEMS}
            selectedKeys={['in_progress']}
            numberKeys
            autoFocus={false}
            search={{ placeholder: 'Set status…', kbd: 'S' }}
          />
        </MenuPanel>
        <div className="flex flex-col items-start gap-4">
          <TooltipChip kbd="I">Assign to me</TooltipChip>
          <TooltipChip kbd="L">Labels</TooltipChip>
          <Toast action={{ label: 'Undo', onAction: () => {} }} kbd="⌘Z">
            Moved HBR-71 to In review
          </Toast>
        </div>
      </div>
    </Sec>
  );
}

function ErrorEmptySection() {
  return (
    <Sec title="Error and empty">
      <Banner
        action={
          <Button variant="secondary" size="sm">
            Try again
          </Button>
        }
      >
        Couldn’t load tasks. The server didn’t answer in time.
      </Banner>
      <ReadOnlyNote>Fields come from the file in the repository. Comments stay in this app.</ReadOnlyNote>
      <EmptyState
        framed
        align="center"
        title="Nothing needs you"
        text="Reviews, mentions and blocked work land here."
      />
    </Sec>
  );
}

// ── Extras: pickers, calendar, swatches, dialogs ─────────────────────────────────────────────────────────

const LABEL_ITEMS: PickerMenuItem[] = [
  ['payouts', 6, 34],
  ['reliability', 9, 12],
  ['backend', 2, 22],
  ['customer-facing', 8, 9],
  ['api', 1, 14],
  ['refunds', 4, 7],
  ['disputes', 7, 5],
  ['fraud', 4, 4],
  ['ledger', 5, 11],
].map(([name, color, count]) => ({
  id: String(name),
  label: String(name),
  lead: <LabelDot color={Number(color)} />,
  meta: String(count),
}));

function ExtrasFrame({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      id={`m5-extras-${theme}`}
      data-frame={`m5-extras-${theme}`}
      className={cn(theme, 'flex w-[1440px] flex-col gap-7 bg-bg px-10 pt-8 pb-10 font-sans text-md text-fg')}
    >
      <div className="flex items-baseline gap-4">
        <h2 className="m-0 font-serif text-2xl font-medium">Kit, continued</h2>
        <span className="text-fg-3">
          {theme === 'dark' ? 'Dark' : 'Light'} · pickers (071–079), calendar, swatches, dialogs (097, 119)
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <LabelPickerDemo />
        <LabelCreateDemo />
        <DuePickerDemo />
        <BlockerPickerDemo />
      </div>
      <div className="flex flex-wrap items-start gap-10">
        <Sec title="Interactive pickers">
          <InteractivePickers />
        </Sec>
        <Sec title="Colour swatches">
          <SwatchesDemo />
        </Sec>
        <Sec title="Progress">
          <div className="flex w-80 flex-col gap-3">
            <ProgressBar done={14} total={22} showCount />
            <SegmentedBar
              segments={[
                { tone: 'done', value: 9, label: 'done' },
                { tone: 'review', value: 3, label: 'in review' },
                { tone: 'progress', value: 4, label: 'in progress' },
              ]}
              total={22}
            />
            <SegmentLegend
              segments={[
                { tone: 'done', value: 9, label: 'done' },
                { tone: 'review', value: 3, label: 'in review' },
                { tone: 'progress', value: 4, label: 'in progress' },
              ]}
            />
          </div>
        </Sec>
        <Sec title="Keys">
          <Row>
            <KeyHint keys="S" />
            <KeyHint keys="⇧D" />
            <KeyHint keys="⌘↵" />
            <KeyHint keys={['G', 'H']}>Go to Home</KeyHint>
          </Row>
          <BlockedNotice count={2} className="w-80" />
        </Sec>
      </div>
      <div className="flex flex-wrap items-start gap-10">
        <Sec title="Confirm dialog on the scrim">
          <ConfirmFrame />
        </Sec>
        <Sec title="Skeleton rows">
          <div className="w-140 overflow-hidden rounded-md border border-line-soft">
            <SkeletonRows count={3} />
          </div>
        </Sec>
      </div>
    </div>
  );
}

function LabelPickerDemo() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['payouts', 'reliability', 'backend', 'customer-facing']),
  );
  return (
    <MenuPanel width={292}>
      <PickerMenu
        aria-label="Labels (sample)"
        selectionMode="multiple"
        autoFocus={false}
        sections={[
          { id: 'on', title: 'On this task', items: LABEL_ITEMS.slice(0, 4) },
          { id: 'all', title: 'All labels in Payments · 30', items: LABEL_ITEMS.slice(4) },
        ]}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        search={{ placeholder: 'Add labels…', kbd: 'L' }}
        footer={{
          hints: [
            { keys: '↵', label: 'toggle' },
            { keys: 'Esc', label: 'done' },
          ],
          end: `${selected.size} selected`,
        }}
      />
    </MenuPanel>
  );
}

function LabelCreateDemo() {
  const [color, setColor] = useState(1);
  return (
    <MenuPanel width={292}>
      <PickerMenu
        aria-label="Labels, create (sample)"
        selectionMode="multiple"
        autoFocus={false}
        items={LABEL_ITEMS}
        query="billing"
        search={{ placeholder: 'Add labels…', kbd: 'L' }}
        create={{
          label: (q) => `Create label “${q}”`,
          emptyTitle: (q) => `No label named “${q}” in Payments`,
          onCreate: () => {},
        }}
        footer={{
          hints: [
            { keys: '↵', label: 'create and add' },
            { keys: 'Tab', label: 'colour' },
          ],
        }}
      >
        <div className="px-2 pt-0.5 pb-1.5">
          <ColorSwatches label="Colour" size={18} value={color} onChange={setColor} />
        </div>
        <div className="mx-0.5 mb-0.5 rounded-sm bg-bg-lane px-2.5 py-2 text-xs leading-normal text-fg-2">
          Labels named “billing” in other projects show as one label in workspace filters.
        </div>
      </PickerMenu>
    </MenuPanel>
  );
}

function DuePickerDemo() {
  const [due, setDue] = useState<string | null>('2026-10-31');
  return (
    <MenuPanel width={264}>
      <PickerMenu
        aria-label="Due date (sample)"
        selectionMode="none"
        autoFocus={false}
        search={{ placeholder: 'Type a date: fri, in 2 weeks', kbd: '⇧D', filter: false }}
        items={[
          { id: 'today', label: 'Today', meta: 'Tue, Nov 3' },
          { id: 'tomorrow', label: 'Tomorrow', meta: 'Wed, Nov 4' },
          { id: 'next-week', label: 'Next week', meta: 'Mon, Nov 9' },
        ]}
        footer={{
          hints: [
            { keys: '↵', label: 'set' },
            { keys: '←→', label: 'day' },
          ],
          end: 'Now: Oct 31',
        }}
      >
        <div className="-mx-1.5 border-t border-line-soft pt-1">
          <Calendar value={due} onChange={setDue} />
        </div>
        <div className="-mx-1.5 border-t border-line-soft px-1.5 pt-1.5">
          <MenuRowButton onPress={() => setDue(null)} trailing={<span className="text-fg-3">×</span>}>
            Clear due date
          </MenuRowButton>
        </div>
      </PickerMenu>
    </MenuPanel>
  );
}

function BlockerPickerDemo() {
  return (
    <MenuPanel width={430}>
      <PickerMenu
        aria-label="Blocked by (sample)"
        selectionMode="none"
        autoFocus={false}
        query="150"
        onRemove={() => {}}
        sections={[
          {
            id: 'results',
            title: 'Results',
            items: [
              {
                id: 'PAY-150',
                taskKey: 'PAY-150',
                label: 'Payout status webhooks for merchants',
                lead: <StatusGlyph status="todo" decorative />,
                tone: 'dim',
                refusal: 'Can’t add: PAY-150 already waits on PAY-142.',
              },
            ],
          },
          {
            id: 'current',
            title: 'Blocked by',
            filter: false,
            items: [
              {
                id: 'PAY-120',
                taskKey: 'PAY-120',
                label: 'Idempotency keys for payouts',
                lead: <StatusGlyph status="in_review" decorative />,
                removable: true,
              },
              {
                id: 'PAY-131',
                taskKey: 'PAY-131',
                label: 'Payout state machine',
                lead: <StatusGlyph status="done" decorative />,
                tone: 'done',
                removable: true,
              },
              { id: 'gone', label: 'Removed task', tone: 'gone', removable: true },
            ],
          },
        ]}
        search={{ placeholder: 'Search tasks…', kbd: '⇧B' }}
        footer={{
          hints: [
            { keys: '↵', label: 'add' },
            { keys: '⌫', label: 'remove' },
          ],
          end: 'Only tasks in Payments',
        }}
      />
    </MenuPanel>
  );
}

function InteractivePickers() {
  const [status, setStatus] = useState<string>('in_progress');
  const [labels, setLabels] = useState<Set<string>>(() => new Set(['payouts']));
  const statusLabel = STATUS_ITEMS.find((item) => item.id === status)?.label ?? 'Status';
  return (
    <Row>
      <PickerMenuPopover
        aria-label="Status"
        trigger={
          <Button variant="secondary">
            <StatusGlyph status={status as TaskStatus} decorative />
            {statusLabel}
          </Button>
        }
        items={STATUS_ITEMS}
        selectedKeys={[status]}
        onAction={setStatus}
        numberKeys
        search={{ placeholder: 'Change status…', kbd: 'S' }}
        footer={{ hints: [{ keys: '1–6', label: 'pick' }] }}
        width={262}
      />
      <PickerMenuPopover
        aria-label="Labels"
        trigger={<Button variant="secondary">Labels · {labels.size}</Button>}
        selectionMode="multiple"
        items={LABEL_ITEMS}
        selectedKeys={labels}
        onSelectionChange={setLabels}
        search={{ placeholder: 'Add labels…', kbd: 'L' }}
        create={{ label: (q) => `Create label “${q}”`, onCreate: () => {} }}
        footer={{
          hints: [
            { keys: '↵', label: 'toggle' },
            { keys: 'Esc', label: 'done' },
          ],
          end: `${labels.size} selected`,
        }}
        width={292}
      />
    </Row>
  );
}

function SwatchesDemo() {
  const [color, setColor] = useState(4);
  return <ColorSwatches aria-label="Label colour" value={color} onChange={setColor} />;
}

function ConfirmFrame() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative grid h-60 w-130 place-items-center overflow-hidden rounded-lg bg-bg-lane">
        <Scrim />
        <div className="relative z-31">
          <DialogSurface width={440}>
            <ConfirmBody isStatic title="Delete the label “reliability”?">
              It’s used on <b>12 tasks</b> in Payments. They lose this label and keep everything else. You
              can’t undo this.
            </ConfirmBody>
            <DialogFooter>
              <Button variant="secondary">Cancel</Button>
              <Button variant="danger">Delete label</Button>
            </DialogFooter>
          </DialogSurface>
        </div>
      </div>
      <AriaButton
        onPress={() => setOpen(true)}
        className="self-start rounded-sm text-sm font-medium text-accent-text outline-none hover:underline focus-visible:shadow-[var(--focus-ring)]"
      >
        Open the confirm dialog
      </AriaButton>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Delete the label “reliability”?"
        confirmLabel="Delete label"
        onConfirm={() => {}}
      >
        It’s used on <b>12 tasks</b> in Payments. They lose this label and keep everything else. You can’t
        undo this.
      </ConfirmDialog>
    </div>
  );
}
