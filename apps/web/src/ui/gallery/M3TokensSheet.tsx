import type { ReactNode } from 'react';
import { Avatar } from '../Avatar';
import { KeyValueRow, LabelChip, MissingTaskLink, TaskLink } from '../BacklogBlock';
import { BoardCard, BoardCardGhost, BoardColumn, DropLine } from '../Board';
import { Checklist } from '../Checklist';
import { ConnectionStatusTag, ProviderBadge } from '../Connection';
import { CopyField } from '../CopyField';
import { cn } from '../cn';
import { Kbd } from '../Kbd';
import { PropertyGrid } from '../layout/PropertyGrid';
import { MappingRow, MappingTable } from '../Mapping';
import { CycleGlyph } from '../PlanningGlyph';
import { ProblemList, ProblemRow } from '../Problems';
import { SetupSteps } from '../SetupSteps';
import { SourceButton, SourceStatusDot } from '../SourceStatus';
import { SourceStrip } from '../SourceStrip';
import { StatusSquare } from '../StatusSquare';
import { SystemActorAvatar } from '../SystemActor';
import { STATUS_ITEMS } from './m3-sample';

/** Reproduces .agent/design/m3/screens/01-0a-M3Tokens-light.png and 02-0b-M3Tokens-dark.png (1280×800). */

const TOKENS: { name: string; chip: ReactNode; note: string }[] = [
  {
    name: '--sys-bg / --sys-fg',
    chip: (
      <span className="grid size-full place-items-center bg-sys-bg font-mono text-[11px] text-sys-fg">B</span>
    ),
    note: 'The Backlog.md actor: a filled square. People are round, agents are outlined squares.',
  },
  {
    name: '--hatch',
    chip: <span className="locked-hatch block size-full" />,
    note: 'Diagonal hatch on anything Backlog.md owns. Always paired with the words “file” or “comes from Backlog.md”.',
  },
  {
    name: '--src-bg',
    chip: <span className="block size-full bg-src-bg" />,
    note: 'Ground of the source strip and the Backlog.md section on a task.',
  },
];

const KEYS: [string[], ReactNode][] = [
  [['⇧R'], 'Refresh the mirror now. Project views and Backlog.md settings, owners and admins.'],
  [
    ['⇧M'],
    'On a mirrored task, ⇧M and clicks on hatched fields open the “comes from Backlog.md” note instead of a picker. ⇧C still sets the cycle.',
  ],
  [['⇧H', '⇧L'], 'On a mirrored card, a toast says why it can’t change column. ⇧J/K still reorder.'],
  [['⌘↵'], 'Setup and New from Backlog.md: continue to the next step, and start on the last one.'],
  [['Esc'], 'Setup: cancel. Nothing is written before the last step.'],
];

const heading =
  'border-b border-line pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase';
const note = 'text-[11.5px] leading-[1.4] text-muted';

function Row({ label, children, stretch }: { label: string; children: ReactNode; stretch?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-2.5 text-[12px]', stretch ? 'items-stretch' : 'items-center')}>
      <span className="w-[88px] shrink-0 text-[11px] text-faint">{label}</span>
      {children}
    </div>
  );
}

export function M3TokensSheet() {
  return (
    <section
      aria-label="M3 tokens and components"
      data-frame="m3-tokens"
      className="box-border grid h-[800px] w-[1280px] grid-cols-[300px_minmax(0,1fr)_300px] gap-7 overflow-hidden bg-bg px-7 py-6"
    >
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className={heading}>New tokens · ledger-m3.css</div>
        {TOKENS.map((token) => (
          <div key={token.name} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2.5">
            <span className="box-border h-8 w-11 overflow-hidden border border-line">{token.chip}</span>
            <div>
              <div className="font-mono text-[10.5px]">{token.name}</div>
              <div className={note}>{token.note}</div>
            </div>
          </div>
        ))}
        <div className={note}>
          Status colours reuse M1 and M2 tokens: --done for healthy, --warn for problems, --danger for
          failures, --faint outline for paused.
        </div>
        <div className={cn(heading, 'mt-1.5')}>Keyboard · added in M3</div>
        <div className="grid grid-cols-[62px_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-[7px] text-[12px] leading-[1.4]">
          {KEYS.map(([keys, what]) => (
            <div key={keys.join()} className="contents">
              <span className="flex gap-[3px]">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <div className={heading}>Components and states</div>
        <Row label="Actor">
          <SystemActorAvatar />
          <SystemActorAvatar size="lg" />
          <Avatar name="Ana Ruiz" hue={25} />
          <Avatar name="claude-dev" kind="agent" />
          <span className="text-faint">Backlog.md · person · agent</span>
        </Row>
        <Row label="Mirror state">
          <SourceStatusDot state="healthy" decorative />
          healthy
          <SourceStatusDot state="reading" decorative />
          refreshing
          <SourceStatusDot state="warnings" decorative />
          problems
          <SourceStatusDot state="failed" decorative />
          failed
          <SourceStatusDot state="paused" decorative />
          paused / detached
        </Row>
        <Row label="Provider">
          <ProviderBadge provider="github" />
          <ProviderBadge provider="gitlab" />
          <ProviderBadge provider="gitea" />
          <span className="text-faint">letters, no logos</span>
        </Row>
        <Row label="Connection">
          <ConnectionStatusTag status="working" />
          <ConnectionStatusTag status="unreachable" />
          <ConnectionStatusTag status="rejected" />
        </Row>
        <Row label="Source button">
          <SourceButton state="healthy" note="3m ago" />
          <SourceButton state="warnings" note="31 problems" isOpen />
        </Row>
        <Row label="Property" stretch>
          <PropertyGrid
            className="flex-1 [&>div]:gap-[3px] [&>div]:pt-[7px] [&>div]:pb-2"
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
                id: 'cycle',
                label: 'Cycle',
                value: (
                  <>
                    <CycleGlyph state="progress" progress={0.6} />
                    Cycle 4
                  </>
                ),
              },
            ]}
          />
        </Row>
        <Row label="Source strip">
          <SourceStrip
            className="flex-1"
            lead="From"
            path="backlog/tasks/back-786 - Retry-failed-webhook-deliveries.md"
            link={{ label: 'Open file', href: 'https://gitlab.com/reddevs/payments' }}
          />
        </Row>
        <Row label="Backlog.md section" stretch>
          <div className="flex flex-1 flex-col border border-line bg-src-bg">
            <dl className="m-0">
              <KeyValueRow label="Labels">
                <LabelChip>webhooks</LabelChip>
                <LabelChip>retries</LabelChip>
              </KeyValueRow>
              <KeyValueRow label="Depends on">
                <TaskLink
                  taskKey="PAY-805"
                  title="Signature check"
                  status="in_progress"
                  href="/__ui"
                  className="w-auto"
                />
                <MissingTaskLink backlogId="BACK-12">no task</MissingTaskLink>
              </KeyValueRow>
            </dl>
          </div>
        </Row>
        <Row label="Steps">
          <SetupSteps
            orientation="horizontal"
            className="flex-1"
            steps={[
              { id: 'mode', label: 'Mode', state: 'done' },
              { id: 'source', label: 'Source', state: 'current' },
              { id: 'mappings', label: 'Mappings', state: 'todo' },
            ]}
          />
        </Row>
        <Row label="Mapping row" stretch>
          <MappingTable aria-label="Status mapping" columns={null} className="flex-1">
            <MappingRow from="In Progress" items={STATUS_ITEMS} value="in_progress" how="name" count={9} />
            <MappingRow from="Blocked" items={STATUS_ITEMS} value="todo" how="fallback" count={2} />
            <MappingRow from="Needs info" items={STATUS_ITEMS} value="todo" count={4} isFocused />
          </MappingTable>
        </Row>
        <Row label="Problem row" stretch>
          <ProblemList className="flex-1">
            <ProblemRow severity="error" file="back-233 - Retry-SEPA.md" layout="inline">
              frontmatter is not valid YAML
            </ProblemRow>
          </ProblemList>
        </Row>
        <Row label="Copy field">
          <CopyField
            className="flex-1"
            value="https://pm.example.com/api/webhooks/backlog/01JB7Q4X2M9K"
          />
        </Row>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <div className={heading}>Board while dragging a mirrored card</div>
        <div className="flex h-[220px] border border-line">
          <BoardColumn status="in_progress" label="Own column" count={2}>
            <BoardCard taskKey="PAY-797" title="Stream invoice PDFs" />
            <DropLine />
            <BoardCardGhost className="h-10" />
          </BoardColumn>
          <BoardColumn status="in_review" label="Other" count={1} refusal>
            <BoardCard taskKey="PAY-801" title="Failed deliveries" />
          </BoardColumn>
        </div>
        <div className={note}>
          Reordering inside the column is allowed: the order is app-owned after the first read. Other columns
          hatch, dim their cards and say why.
        </div>
        <div className={cn(heading, 'mt-1.5')}>Checklist from a Backlog.md section</div>
        <Checklist
          aria-label="Acceptance criteria"
          items={[
            { index: 1, text: 'Retries follow the schedule', checked: true },
            { index: 3, text: 'A 429 waits for Retry-After', checked: false },
          ]}
        />
        <div className={note}>Read-only. It ticks when the file changes, never from a click here.</div>
      </div>
    </section>
  );
}
