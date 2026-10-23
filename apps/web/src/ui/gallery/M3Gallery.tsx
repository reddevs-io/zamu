import { type ReactNode, useState } from 'react';
import type { Key } from 'react-aria-components';
import { Avatar, UnassignedAvatar } from '../Avatar';
import { BacklogBlock, KeyValueRow, LabelChip, MissingTaskLink, TaskLink } from '../BacklogBlock';
import { BoardCard, BoardCardGhost, BoardColumn, DropLine } from '../Board';
import { Button } from '../Button';
import { Checklist } from '../Checklist';
import { InlineCode } from '../CodeBlock';
import {
  CONNECTION_STATUSES,
  ConnectionStatusTag,
  GIT_PROVIDERS,
  PROVIDER_LABELS,
  ProviderBadge,
  StateTag,
} from '../Connection';
import { CopyField } from '../CopyField';
import { cn } from '../cn';
import { FactList } from '../FactList';
import { Kbd } from '../Kbd';
import { DisabledCreateButton, lockedHatch, OwnedFieldCaption } from '../Locked';
import { PropertyGrid } from '../layout/PropertyGrid';
import { type MappingHow, MappingRow, MappingTable } from '../Mapping';
import { CycleGlyph, MilestoneGlyph } from '../PlanningGlyph';
import { PriorityGlyph } from '../PriorityGlyph';
import { ProblemList, ProblemRow } from '../Problems';
import { ProgressBar } from '../Progress';
import { type SetupStep, SetupSteps, StepMarker, type StepState } from '../SetupSteps';
import { SOURCE_DOT_LABELS, SOURCE_DOT_STATES, SourceButton, SourceStatusDot } from '../SourceStatus';
import { NoticeStrip, SourceStrip, TruncatedPath } from '../SourceStrip';
import { StatusSquare } from '../StatusSquare';
import { SystemActorAvatar, SystemActorDot } from '../SystemActor';
import { Toast } from '../Toast';
import { ASSIGNEE_ITEMS, PRIORITY_ITEMS, STATUS_ITEMS, TASK_FILE, WEBHOOK_URL } from './m3-sample';

/** /__ui sections for the M3 kit additions (Backlog.md mirror and import). Each demo shows its states. */
export function M3Gallery() {
  return (
    <>
      <IdentitySection />
      <HeaderSection />
      <TaskSection />
      <SetupSection />
      <ProblemsSection />
      <BoardSection />
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
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="caps">{label}</span>
      {children}
    </div>
  );
}

const note = 'text-[11.5px] text-muted';

// ── Actor, states, providers ────────────────────────────────────────────────────────────────────────

function IdentitySection() {
  return (
    <Section title="M3 · Backlog.md actor, mirror states, providers">
      <div className="grid grid-cols-3 gap-6">
        <Demo label="System actor (sm, lg) and timeline dot">
          <div className="flex items-center gap-2.5">
            <SystemActorAvatar />
            <SystemActorAvatar size="lg" />
            <Avatar name="Ana Ruiz" hue={25} />
            <Avatar name="claude-dev" kind="agent" />
          </div>
          <div className="flex flex-col gap-2.5">
            <TimelineLine dot={<SystemActorDot />} who="Backlog.md" what="moved it from Todo to In progress">
              <span className="font-mono text-[11.5px] text-muted">3f2a1c9</span>
            </TimelineLine>
            <TimelineLine
              dot={<span className="size-[7px] justify-self-center rounded-full bg-line" />}
              who="Ana Ruiz"
              what="added it to Cycle 4"
            />
            <TimelineLine
              dot={<span className="size-[7px] justify-self-center bg-accent" />}
              who="claude-dev"
              what="commented"
            />
          </div>
        </Demo>
        <Demo label="Source status dot">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-[12px]">
            {SOURCE_DOT_STATES.map((state) => (
              <div key={state} className="contents">
                <SourceStatusDot state={state} />
                <span>
                  {state} <span className="text-faint">· {SOURCE_DOT_LABELS[state]}</span>
                </span>
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Provider badge (md, sm)">
          {GIT_PROVIDERS.map((provider) => (
            <div key={provider} className="flex items-center gap-2.5 text-[12px]">
              <ProviderBadge provider={provider} />
              <ProviderBadge provider={provider} size="sm" decorative />
              <span>{PROVIDER_LABELS[provider]}</span>
            </div>
          ))}
        </Demo>
        <Demo label="Connection status tag">
          <div className="flex flex-wrap items-center gap-2">
            {CONNECTION_STATUSES.map((status) => (
              <ConnectionStatusTag key={status} status={status} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionStatusTag status="unreachable" withDot={false} />
            <StateTag tone="warn">mirror paused</StateTag>
            <span className={note}>without a dot (settings page)</span>
          </div>
        </Demo>
        <Demo label="Facts (settings, popover)" className="col-span-2">
          <div className="grid grid-cols-2 gap-6">
            <FactList
              items={[
                { id: 'mode', label: 'Mode', value: 'Mirror · follows the default branch' },
                {
                  id: 'connection',
                  label: 'Connection',
                  value: (
                    <span className="flex items-center gap-2">
                      <ProviderBadge provider="gitlab" size="sm" decorative />
                      GitLab · reddevs
                      <ConnectionStatusTag status="unreachable" withDot={false} />
                    </span>
                  ),
                },
                {
                  id: 'read',
                  label: 'Last good read',
                  value: (
                    <>
                      3m ago by webhook, commit <span className="font-mono text-[11px]">a1b2c3d</span>
                    </>
                  ),
                },
              ]}
            />
            <div className="border border-line bg-surface shadow-dialog">
              <div className="flex items-center gap-2 border-b border-line-2 px-3 py-2.5">
                <SourceStatusDot state="warnings" decorative />
                <b className="font-semibold">Mirroring, with problems</b>
                <span className="flex-1" />
                <Kbd>⇧R</Kbd>
              </div>
              <FactList
                size="sm"
                labelWidth={96}
                className="px-3 py-2.5"
                items={[
                  {
                    id: 'source',
                    label: 'Source',
                    value: <span className="font-mono text-[11px]">gitlab.com/reddevs/payments · main</span>,
                  },
                  { id: 'next', label: 'Next check', value: 'in 57m' },
                  {
                    id: 'problems',
                    label: 'Problems',
                    value: <span className="text-warn">30 files skipped, 1 status unmapped</span>,
                  },
                ]}
              />
            </div>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function TimelineLine({
  dot,
  who,
  what,
  children,
}: {
  dot: ReactNode;
  who: string;
  what: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px] text-muted">
      {dot}
      <span>
        <b className="font-semibold text-fg">{who}</b> {what} {children}
      </span>
      <span className="font-mono text-[10px] text-faint">2h</span>
    </div>
  );
}

// ── Project header ──────────────────────────────────────────────────────────────────────────────────

function HeaderSection() {
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState(false);
  return (
    <Section title="M3 · Mirrored project header">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Source button: default, open, warning, failed, reading, paused">
          <div className="flex flex-wrap items-center gap-2">
            <SourceButton state="healthy" note="3m ago" />
            <SourceButton state="healthy" note="3m ago" isOpen />
            <SourceButton state="warnings" note="31 problems" />
            <SourceButton state="failed" note="failed 14m ago" />
            <SourceButton state="reading" note="refreshing" />
            <SourceButton state="paused" note="paused" />
          </div>
        </Demo>
        <Demo label="Disabled create, with its tooltip (hover or focus the live one)">
          <div className="flex items-start gap-2.5">
            <DisabledCreateButton tooltip={<CreateTooltip />} onPress={() => setToast(true)} />
            <span className={note}>Press shows the toast a screen would show.</span>
          </div>
          {toast ? (
            <Toast timeout={4000} onDismiss={() => setToast(false)} className="self-start">
              Tasks in Payments come from Backlog.md.
            </Toast>
          ) : null}
        </Demo>
        <Demo label="Disabled create, tooltip open" className="col-span-2">
          <div className="flex h-[150px] items-start justify-end border border-line-2 p-3">
            <DisabledCreateButton
              tooltip={<CreateTooltip />}
              isTooltipOpen={open}
              onTooltipOpenChange={setOpen}
            />
            <Button variant="secondary" size="sm" className="ml-3" onPress={() => setOpen(!open)}>
              {open ? 'Close tooltip' : 'Open tooltip'}
            </Button>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function CreateTooltip() {
  return (
    <>
      Tasks in Payments come from Backlog.md. Add a file under <code>backlog/tasks/</code>, or run{' '}
      <code>backlog task create</code>, and push. It shows up here after the next refresh.
    </>
  );
}

// ── Mirrored task ───────────────────────────────────────────────────────────────────────────────────

const LONG_LABELS = [
  'webhooks',
  'retries',
  'reliability',
  'merchant-facing',
  'pg-boss',
  'needs-docs',
  'q4',
  'sla',
  'p1-customer',
  'acme-retail',
  'observability',
  'backend',
  'api',
  'breaking-change-maybe',
  'security-review',
];

function TaskSection() {
  return (
    <Section title="M3 · Mirrored task">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Source strip: mirroring, detached">
          <SourceStrip
            lead="Fields with a hatch come from"
            path={TASK_FILE}
            link={{ label: 'Open file', href: 'https://gitlab.com/reddevs/payments' }}
          />
          <SourceStrip
            lead="Was mirrored from"
            path={TASK_FILE}
            link={{ label: 'View file', href: 'https://gitlab.com/reddevs/payments' }}
          />
        </Demo>
        <Demo label="Truncated path: from the start, from the end">
          <TruncatedPath path={TASK_FILE} className="block w-[320px]" />
          <TruncatedPath path={TASK_FILE} truncate="end" className="block w-[320px]" />
        </Demo>
        <Demo label="Locked properties (hatch and · file), cycle still editable" className="col-span-2">
          <PropertyGrid
            items={[
              {
                id: 'status',
                label: 'Status',
                locked: true,
                value: (
                  <>
                    <StatusSquare status="in_progress" />
                    In progress
                  </>
                ),
              },
              {
                id: 'priority',
                label: 'Priority',
                locked: true,
                value: (
                  <>
                    <PriorityGlyph priority="high" />
                    High
                  </>
                ),
              },
              {
                id: 'assignee',
                label: 'Assignee',
                locked: true,
                value: (
                  <>
                    <Avatar name="claude-dev" kind="agent" decorative />
                    claude-dev
                  </>
                ),
                sub: '+1 in Backlog.md',
              },
              {
                id: 'milestone',
                label: 'Milestone',
                locked: true,
                value: (
                  <>
                    <MilestoneGlyph />
                    Webhooks v2
                  </>
                ),
                sub: 'm-3',
              },
              {
                id: 'cycle',
                label: 'Cycle',
                value: (
                  <>
                    <CycleGlyph state="progress" progress={0.6} />
                    Cycle 4
                  </>
                ),
                sub: '3d left',
              },
            ]}
          />
          <div className="flex items-center gap-3">
            <span className={cn('caps border border-line px-2.5 py-2', lockedHatch)}>
              Created <OwnedFieldCaption />
            </span>
            <span className={note}>
              lockedHatch and OwnedFieldCaption on any cell: the task panel draws its own property cells.
            </span>
          </div>
        </Demo>
        <Demo label="Backlog.md block">
          <BacklogBlock backlogId="BACK-786" note="read-only · fields this app doesn’t have">
            <KeyValueRow label="Labels">
              <LabelChip>webhooks</LabelChip>
              <LabelChip>retries</LabelChip>
              <LabelChip>reliability</LabelChip>
            </KeyValueRow>
            <KeyValueRow label="Also assigned">
              <span className="inline-flex items-center gap-1.5">
                <Avatar name="codex-ci" kind="agent" initials="X" decorative />
                @codex <span className="text-faint">is codex-ci</span>
              </span>
              <span className="text-faint">·</span>
              <span className="inline-flex items-center gap-1.5">
                <UnassignedAvatar decorative />
                @francis <span className="text-faint">matches no member</span>
              </span>
            </KeyValueRow>
            <KeyValueRow label="Depends on" layout="stack">
              <TaskLink
                taskKey="PAY-805"
                title="Webhook signature check accepts expired timestamps"
                status="in_progress"
                href="/__ui"
              />
              <MissingTaskLink backlogId="BACK-12" />
            </KeyValueRow>
            <KeyValueRow label="Subtasks" layout="stack">
              <TaskLink
                taskKey="PAY-786.1"
                title="Honour Retry-After on 429 responses"
                status="in_progress"
                href="/__ui"
              />
              <TaskLink
                taskKey="PAY-786.2"
                title="Dead-letter queue after the sixth attempt"
                status="todo"
                href="/__ui"
              />
            </KeyValueRow>
            <KeyValueRow label="Due · type" layout="plain">
              Nov 14, 2026 · feature
            </KeyValueRow>
            <KeyValueRow label="References" layout="stack">
              <span className="truncate font-mono text-[11px]">https://docs.stripe.com/webhooks#retries</span>
              <span className="truncate font-mono text-[11px]">src/webhooks/delivery.ts</span>
            </KeyValueRow>
            <KeyValueRow label="Other fields">
              <span className="font-mono text-[11px]">estimate: 5</span>
              <span className="text-faint">·</span>
              <span className="font-mono text-[11px]">customer: acme-retail</span>
            </KeyValueRow>
          </BacklogBlock>
        </Demo>
        <div className="flex min-w-0 flex-col gap-6">
          <Demo label="Backlog.md block: long labels, after detach">
            <BacklogBlock backlogId="BACK-786" note="kept from the import · read-only">
              <KeyValueRow label="Labels">
                {LONG_LABELS.map((label) => (
                  <LabelChip key={label}>{label}</LabelChip>
                ))}
              </KeyValueRow>
            </BacklogBlock>
          </Demo>
          <Demo label="Checklist (read-only)">
            <div className="flex flex-col gap-2.5 border border-line-2 px-3.5 py-3">
              <h4 className="m-0 text-[12px] font-semibold">Acceptance criteria</h4>
              <Checklist
                aria-label="Acceptance criteria"
                items={[
                  {
                    index: 1,
                    text: 'Retries follow 30s, 1m, 2m, 4m, 8m, 16m with ±20% jitter',
                    checked: true,
                  },
                  { index: 2, text: '4xx stops retrying, except 408 and 429', checked: true },
                  {
                    index: 3,
                    text: 'A 429 waits for Retry-After and doesn’t use an attempt',
                    checked: false,
                  },
                ]}
              />
            </div>
          </Demo>
        </div>
        <Demo label="Notice strip: hidden tasks, refreshing, webhook, no problems" className="col-span-2">
          <NoticeStrip marker={<SourceStatusDot state="paused" decorative />}>
            <span>
              9 tasks whose files are gone from <InlineCode>main</InlineCode>. They’re hidden from lists, the
              board, My tasks and the dashboard, and come back if their file returns. Comments are kept.
            </span>
          </NoticeStrip>
          <NoticeStrip
            marker={<SourceStatusDot state="reading" decorative />}
            trailing={
              <ProgressBar done={0} inProgress={3} total={6} label="Files read" className="max-w-[120px]" />
            }
          >
            <span>
              Reading commit <span className="font-mono text-[11px]">c4d81e2</span>: 6 files changed since the
              last refresh. 3 of 6 read.
            </span>
          </NoticeStrip>
          <NoticeStrip
            marker={<SourceStatusDot state="paused" decorative />}
            trailing={<span className="text-faint">Listening…</span>}
          >
            <span>
              Last notification received: <b>never</b>
            </span>
          </NoticeStrip>
          <NoticeStrip marker={<SourceStatusDot state="healthy" decorative />}>
            <span>None. Every file was read and every value is mapped.</span>
          </NoticeStrip>
        </Demo>
      </div>
    </Section>
  );
}

// ── Setup ───────────────────────────────────────────────────────────────────────────────────────────

const STEP_NAMES = ['Mode', 'Source', 'Mappings', 'Preview', 'Read'];
const STEP_NOTES = ['Mirror', 'backlog/', '13 values', '412 tasks', ''];

function stepsAt(current: number, allDone = false): SetupStep[] {
  return STEP_NAMES.map((label, i) => {
    const n = i + 1;
    const state: StepState = allDone || n < current ? 'done' : n === current ? 'current' : 'todo';
    return { id: label.toLowerCase(), label, state, note: state === 'done' ? STEP_NOTES[i] : undefined };
  });
}

interface MapEntry {
  from: string;
  value: Key;
  how: MappingHow;
  count: number;
}

const STATUS_MAP: MapEntry[] = [
  { from: 'To Do', value: 'todo', how: 'name', count: 24 },
  { from: 'In Progress', value: 'in_progress', how: 'name', count: 9 },
  { from: 'Review', value: 'in_review', how: 'name', count: 3 },
  { from: 'Done', value: 'done', how: 'name', count: 690 },
  { from: 'Won’t do', value: 'canceled', how: 'name', count: 7 },
  { from: 'Blocked', value: 'todo', how: 'fallback', count: 2 },
];

function useMapping(initial: MapEntry[]) {
  const [rows, setRows] = useState(initial);
  const set = (from: string, value: Key) =>
    setRows((current) =>
      current.map((row) => (row.from === from ? { ...row, value, how: 'manual' as const } : row)),
    );
  return [rows, set] as const;
}

function SetupSection() {
  const [status, setStatus] = useMapping(STATUS_MAP);
  const [priority, setPriority] = useMapping([
    { from: 'high', value: 'high', how: 'name', count: 41 },
    { from: 'medium', value: 'medium', how: 'name', count: 133 },
    { from: 'low', value: 'low', how: 'name', count: 88 },
  ]);
  const [assignees, setAssignees] = useMapping([
    { from: '@claude', value: 'claude', how: 'name', count: 219 },
    { from: '@ana', value: 'ana', how: 'name', count: 64 },
    { from: '@codex', value: 'codex', how: 'name', count: 31 },
    { from: '@francis', value: 'none', how: 'fallback', count: 5 },
  ]);
  return (
    <Section title="M3 · Backlog.md setup">
      <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-6">
          <Demo label="Steps: at Mappings">
            <SetupSteps steps={stepsAt(3)} />
          </Demo>
          <Demo label="Steps: all done">
            <SetupSteps steps={stepsAt(5, true)} />
          </Demo>
          <Demo label="Step markers (sm): Read progress">
            <div className="flex flex-col gap-2 text-[12.5px]">
              <span className="flex items-center gap-2.5">
                <StepMarker state="done" number={1} size="sm" />
                Listed files on main at a1b2c3d
              </span>
              <span className="flex items-center gap-2.5">
                <SourceStatusDot state="reading" decorative className="mx-1" />
                <b className="font-semibold">Reading and checking task files</b>
              </span>
              <span className="flex items-center gap-2.5 text-faint">
                <StepMarker state="todo" number={3} size="sm" />
                Creating 6 milestones
              </span>
            </div>
          </Demo>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Demo label="Mapping table: status (select to change; a manual pick drops the note)">
            <MappingTable aria-label="Status mapping">
              {status.map((row) => (
                <MappingRow
                  key={row.from}
                  from={row.from}
                  items={STATUS_ITEMS}
                  value={row.value}
                  how={row.how}
                  count={row.count}
                  onChange={(value) => setStatus(row.from, value)}
                />
              ))}
            </MappingTable>
          </Demo>
          <div className="grid grid-cols-2 gap-4">
            <Demo label="Priority">
              <MappingTable aria-label="Priority mapping" columns={null} selectWidth={150} countWidth={40}>
                {priority.map((row) => (
                  <MappingRow
                    key={row.from}
                    from={row.from}
                    items={PRIORITY_ITEMS}
                    value={row.value}
                    how={row.how}
                    showHow={false}
                    count={row.count}
                    onChange={(value) => setPriority(row.from, value)}
                  />
                ))}
              </MappingTable>
            </Demo>
            <Demo label="Assignees">
              <MappingTable aria-label="Assignee mapping" columns={null} selectWidth={170} countWidth={36}>
                {assignees.map((row) => (
                  <MappingRow
                    key={row.from}
                    from={row.from}
                    items={ASSIGNEE_ITEMS}
                    value={row.value}
                    how={row.how}
                    showHow={false}
                    count={row.count}
                    onChange={(value) => setAssignees(row.from, value)}
                  />
                ))}
              </MappingTable>
            </Demo>
          </div>
          <Demo label="Mapping rows: by name, fallback, focused, disabled">
            <MappingTable aria-label="Mapping row states" columns={null}>
              <MappingRow from="In Progress" items={STATUS_ITEMS} value="in_progress" how="name" count={9} />
              <MappingRow from="Blocked" items={STATUS_ITEMS} value="todo" how="fallback" count={2} />
              <MappingRow from="Needs info" items={STATUS_ITEMS} value="todo" count={4} isFocused />
              <MappingRow from="Archived manually" items={STATUS_ITEMS} value="done" count={1} isDisabled />
            </MappingTable>
          </Demo>
          <Demo label="Summary (settings page, read-only)">
            <MappingTable aria-label="Status mapping summary" variant="summary">
              {STATUS_MAP.map((row) => (
                <MappingRow
                  key={row.from}
                  from={row.from}
                  items={STATUS_ITEMS}
                  value={row.value}
                  how={row.how}
                  count={row.count}
                  isReadOnly
                />
              ))}
            </MappingTable>
          </Demo>
        </div>
      </div>
    </Section>
  );
}

// ── Problems and copy fields ────────────────────────────────────────────────────────────────────────

function ProblemsSection() {
  return (
    <Section title="M3 · Problems and copy fields">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Problem list: columns (settings)" className="col-span-2">
          <ProblemList aria-label="Problems in the last refresh">
            <ProblemRow severity="warning" file={'status “Blocked” · 2 tasks'}>
              not mapped, shown as Todo. Map it in Edit mappings.
            </ProblemRow>
            <ProblemRow
              severity="error"
              file="backlog/tasks/back-12 - Split-ledger-writer-from-the-API-process.md"
            >
              dependencies must be a flat list (line 9)
            </ProblemRow>
            <ProblemRow severity="error" file="backlog/tasks/back-240 - .md">
              no id in frontmatter, and the file name has no title
            </ProblemRow>
            <ProblemRow severity="warning" file="backlog/drafts/draft-7 - Payout-currency-switch.md">
              two files claim DRAFT-7; kept the newer one
            </ProblemRow>
          </ProblemList>
        </Demo>
        <Demo label="Stacked (setup preview: will be skipped)">
          <ProblemList aria-label="Will be skipped">
            <ProblemRow
              severity="error"
              file="backlog/tasks/back-233 - Retry-SEPA-mandates.md"
              layout="stacked"
            >
              frontmatter is not valid YAML (line 4)
            </ProblemRow>
            <ProblemRow
              severity="error"
              file="backlog/tasks/back-305.2 - Card-BIN-lookup.md"
              layout="stacked"
            >
              parent BACK-305 missing; comes in as a top-level task
            </ProblemRow>
          </ProblemList>
        </Demo>
        <Demo label="Without a file (fallbacks)">
          <ProblemList aria-label="Fallbacks">
            <ProblemRow severity="warning">
              Status <InlineCode>Blocked</InlineCode> on 2 tasks shows as Todo.
            </ProblemRow>
            <ProblemRow severity="warning">
              <InlineCode>@francis</InlineCode> on 5 tasks matches no member; they stay unassigned and keep
              the name in their Backlog.md section.
            </ProblemRow>
          </ProblemList>
        </Demo>
        <Demo label="Copy field: URL">
          <CopyField label="URL" value={WEBHOOK_URL} />
        </Demo>
        <Demo label="Copy field: secret (Show, Copy), member view (no value)">
          <CopyField
            label="Secret token"
            value="whsec_9Lq2mX7vR4tB8nK1pW6sZ3yH0Tz4"
            maskedValue="whsec_9Lq2………………………………Tz4"
          />
          <CopyField label="Secret token" maskedValue="whsec_9Lq2………………………………Tz4" />
        </Demo>
      </div>
    </Section>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────────────────────────────

function BoardSection() {
  return (
    <Section title="M3 · Board while dragging a mirrored card">
      <div className="relative flex h-[300px] border border-line">
        <BoardColumn status="todo" count={26} refusal>
          <BoardCard
            taskKey="PAY-786.2"
            title="Dead-letter queue after the sixth attempt"
            priority="medium"
          />
          <BoardCard
            taskKey="PAY-809"
            title="Add idempotency keys to the refund endpoint"
            priority="medium"
          />
        </BoardColumn>
        <BoardColumn status="in_progress" count={9}>
          <BoardCard
            taskKey="PAY-797"
            title="Stream invoice PDFs instead of buffering them"
            priority="medium"
          />
          <DropLine />
          <BoardCardGhost className="h-16" />
          <BoardCard
            taskKey="PAY-805"
            title="Webhook signature check accepts expired timestamps"
            priority="high"
          />
        </BoardColumn>
        <BoardColumn status="in_review" count={3} refusal>
          <BoardCard taskKey="PAY-801" title="Merchant dashboard: failed deliveries" priority="medium" />
        </BoardColumn>
        <BoardColumn status="done" count={367} refusal="Done comes from Backlog.md. Custom refusal text.">
          <BoardCard taskKey="PAY-804" title="Log webhook response bodies up to 4 KB" priority="low" />
        </BoardColumn>
        <Toast floating>Status comes from Backlog.md, so cards move only within their column.</Toast>
      </div>
    </Section>
  );
}
