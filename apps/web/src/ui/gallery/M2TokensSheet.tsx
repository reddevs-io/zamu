import { useState } from 'react';
import { UnassignedAvatar } from '../Avatar';
import { BoardCard, BoardCardGhost, DropLine } from '../Board';
import { Chip } from '../Chip';
import { Kbd } from '../Kbd';
import { MentionChip } from '../MentionChip';
import { CycleGlyph, MilestoneGlyph } from '../PlanningGlyph';
import { DaysLeftPill, ProgressBar } from '../Progress';
import { SegmentedControl } from '../SegmentedControl';
import { MEMBERS } from './sample';

/**
 * Reproduces .agent/design/m2/screens/01-0-M2Tokens-light.png and 02-0-M2Tokens-dark.png (1280 wide).
 * Differences from the canvas, per the M2 plan: no ⇧T row (theme shortcut dropped) and no Profile in
 * the user menu inventory.
 */

const TOKENS: [string, string][] = [
  ['--warn', 'Overdue target dates, rolled-over counts. Text-safe on --bg.'],
  ['--warn-bg', 'Ground for the days-left pill when 3 days or fewer remain.'],
  ['--drop', 'Column under a dragged card.'],
  ['--drop-line', 'Insertion line and drop column outline.'],
  ['--mention', '@mention text. AA on --mention-bg.'],
  ['--mention-bg', '@mention chip ground.'],
  ['--comment-bg', 'Comment body, so comments stand apart from activity lines.'],
  ['--track', 'Empty part of progress bars.'],
];

const KEYS: [string[], string][] = [
  [['V'], 'Switch List and Board in a project'],
  [['H', 'L'], 'Board: previous or next column'],
  [['J', 'K'], 'Board: next or previous card in the column'],
  [['⇧H', '⇧L'], 'Board: move the card to the previous or next status'],
  [['⇧J', '⇧K'], 'Board: move the card down or up in its column'],
  [['↵'], 'Open the focused card or row in the panel'],
  [['⇧M'], 'Set milestone on the selected task'],
  [['⇧C'], 'Set cycle on the selected task'],
  [['M'], 'Focus the comment box'],
  [['⌘↵'], 'Send the comment, save an edit, create in dialogs'],
  [['⇧P'], 'Composer: toggle Write and Preview'],
  [['@'], 'Composer: mention a person or an agent'],
  [['G', 'M'], 'Go to My tasks'],
  [['⌘Z'], 'Undo the last move on the board'],
];

const INVENTORY: [string, string][] = [
  [
    'View tabs',
    'Tasks, Milestones, Cycles. Hidden tabs when a project uses neither. Count or current-cycle note beside each.',
  ],
  ['Segmented switch', 'List and Board; Light, Dark and System. Default, selected, focus.'],
  ['Board column', 'Open, folded to 40px, drop target, long with scroll and "N more", empty.'],
  ['Card', 'Default, hover, focus, selected, dragging, ghost slot. Title clamps at 2 lines.'],
  ['Swimlane', 'Open, collapsed, "No assignee" / "No milestone" lane.'],
  ['Milestone row', 'Planned, active, completed; overdue date; no date; long name.'],
  ['Progress bar', 'Done plus in progress; time-elapsed bar for cycles.'],
  ['Cycle header', 'Current with days left, upcoming, completed summary.'],
  ['Comment', 'Person, agent with "for", edited, own (Edit, Delete), editing, deleted line.'],
  ['Composer', 'Idle, focused, mention picker, preview, sending, failed (text kept).'],
  ['Pickers', 'Milestone and cycle menus with search, none option, check on current.'],
  ['User menu', 'Name, workspace, theme switch, Appearance, sign out.'],
];

const h1 = 'm-0 text-[20px] leading-[1.15] font-semibold tracking-[-0.01em]';
const note = 'text-[11.5px] text-muted';

export function M2TokensSheet() {
  const [view, setView] = useState<'list' | 'board'>('board');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  return (
    <section
      aria-label="M2 tokens and components"
      data-frame="m2-tokens"
      className="grid min-h-[800px] w-[1280px] grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] content-start gap-9 bg-bg px-10 py-8"
    >
      <div className="flex min-w-0 flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <h2 className={h1}>New tokens</h2>
          <p className={`m-0 ${note}`}>
            Added in ledger-m2.css, loaded after ledger.css. No M1 token changed. Milestones and cycles get no
            colour of their own: a diamond and a circle tell them apart, so status keeps its colours.
          </p>
          <div>
            {TOKENS.map(([name, text]) => (
              <div
                key={name}
                className="grid grid-cols-[34px_130px_minmax(0,1fr)] items-center gap-3 border-b border-line-2 py-[7px] text-[12px]"
              >
                <span className="h-6 w-[34px] border border-line" style={{ background: `var(${name})` }} />
                <span className="font-mono text-[10.5px]">{name}</span>
                <span className={note}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <h2 className={h1}>Components</h2>
          <div className="flex flex-col gap-3 border border-line bg-bg p-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Chip glyph={<MilestoneGlyph />}>Planned milestone</Chip>
              <Chip glyph={<MilestoneGlyph filled />}>Active</Chip>
              <Chip glyph={<CycleGlyph />}>C13</Chip>
              <Chip glyph={<CycleGlyph state="progress" progress={0.79} />}>C12 current</Chip>
              <DaysLeftPill daysLeft={3} />
              <MentionChip name="Ana Ruiz" />
              <UnassignedAvatar />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <ProgressBar done={14} inProgress={5} total={22} className="max-w-[200px]" />
              <span className="font-mono text-[10.5px] text-muted">14/22</span>
              <span className={note}>done, then in progress at half strength</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <SegmentedControl
                aria-label="View"
                items={[
                  { id: 'list', label: 'List' },
                  { id: 'board', label: 'Board' },
                ]}
                value={view}
                onChange={setView}
              />
              <SegmentedControl
                aria-label="Theme"
                items={[
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                  { id: 'system', label: 'System' },
                ]}
                value={theme}
                onChange={setTheme}
              />
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
              <BoardCard
                className="w-[190px]"
                taskKey="PAY-142"
                title="Default card"
                priority="high"
                cycle={{ label: 'C12' }}
                assignee={MEMBERS.claude}
              />
              <BoardCard className="w-[190px]" state="focus" taskKey="PAY-138" title="Keyboard focus" />
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
              <BoardCard
                className="w-[190px]"
                state="selected"
                taskKey="PAY-131"
                title="Selected, panel open"
              />
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
              <BoardCardGhost className="h-[52px] w-[190px]" />
              <div className="flex w-[190px] flex-col gap-1.5 pt-2.5">
                <span className={note}>Drop line</span>
                <DropLine className="m-0" />
              </div>
            </div>
            <div className="grid h-[52px] w-[190px] place-items-center bg-drop text-[11.5px] text-muted outline-[1.5px] -outline-offset-2 outline-drop-line outline-dashed">
              Drop column
            </div>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <h2 className={h1}>Keyboard</h2>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[12px]">
            {KEYS.map(([keys, what]) => (
              <div key={what} className="contents">
                <span className="flex gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
                <span>{what}</span>
              </div>
            ))}
          </div>
          <p className={`m-0 ${note}`}>
            M1 keys stay: C new task, / search, J/K move, Esc close, I assign to me. Drag and drop always has
            the keyboard path above; screen readers hear "PAY-140 moved to In review, position 1 of 3".
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <h2 className={h1}>Inventory</h2>
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px] leading-[1.45]">
            {INVENTORY.map(([name, states]) => (
              <div key={name} className="contents">
                <b className="font-semibold">{name}</b>
                <span className="text-muted">{states}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
