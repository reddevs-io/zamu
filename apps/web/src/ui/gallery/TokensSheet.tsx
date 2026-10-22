import { Avatar } from '../Avatar';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { CodeBlock } from '../CodeBlock';
import { cn } from '../cn';
import { Kbd } from '../Kbd';
import type { Priority, TaskStatus } from '../meta';
import { PriorityGlyph } from '../PriorityGlyph';
import { Radio, RadioGroup } from '../RadioGroup';
import { Skeleton } from '../Skeleton';
import { StatusSquare } from '../StatusSquare';
import { Switch } from '../Switch';
import { Tag } from '../Tag';
import { TextField } from '../TextField';

/** Reproduces .agent/design/m1/final/screens/00-tokens-{light,dark}.png (1280×800). */

const SWATCHES: [string, string][] = [
  ['--bg', 'page'],
  ['--surface', 'dialogs, inputs'],
  ['--band', 'group rows, footers'],
  ['--rail', 'project rail'],
  ['--line', 'borders'],
  ['--line-2', 'row dividers'],
  ['--fg', 'text, primary button'],
  ['--muted', 'secondary text'],
  ['--faint', 'hints, meta'],
  ['--accent', 'cobalt: focus, agents, links'],
  ['--sel', 'selected row'],
  ['--review', 'In review'],
  ['--done', 'Done'],
  ['--danger', 'errors, Urgent, revoke'],
  ['--danger-bg', 'error banner'],
];

const TYPE_SCALE: { spec: string; sample: string; className: string }[] = [
  { spec: '26 / 600', sample: 'Task page title', className: 'text-[26px] font-semibold tracking-[-0.02em]' },
  {
    spec: '22 / 600',
    sample: 'Pane title',
    className: 'text-[22px] leading-tight font-semibold tracking-[-0.015em]',
  },
  {
    spec: '20 / 600',
    sample: 'Page heading',
    className: 'text-[20px] leading-[1.15] font-semibold tracking-[-0.01em]',
  },
  { spec: '13.5 / 400', sample: 'Description body text', className: 'text-[13.5px]' },
  { spec: '13 / 400', sample: 'Rows, controls, labels', className: '' },
  { spec: '10 caps / 600', sample: 'Column header', className: 'caps' },
  { spec: 'Mono 10.5', sample: 'PAY-142 · 3m · pm_live_…', className: 'font-mono text-[10.5px] text-muted' },
];

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

function Caption({ children, className }: { children: string; className?: string }) {
  return <div className={cn('caps', className)}>{children}</div>;
}

export function TokensSheet() {
  return (
    <section
      aria-label="Tokens and components"
      className="grid h-[800px] w-[1280px] grid-cols-3 gap-8 overflow-hidden bg-bg px-10 py-8"
    >
      <div className="flex min-w-0 flex-col gap-[18px]">
        <Caption>Color tokens</Caption>
        <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1">
          {SWATCHES.map(([name, use]) => (
            <div key={name} className="contents">
              <span className="size-7 border border-line" style={{ background: `var(${name})` }} />
              <span>
                <span className="font-mono text-[10.5px]">{name}</span>{' '}
                <span className="text-faint">{use}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        <Caption>Type</Caption>
        <div className="flex flex-col gap-2.5">
          {TYPE_SCALE.map((row) => (
            <div key={row.spec} className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-2.5">
              <span className="font-mono text-[10.5px] text-faint">{row.spec}</span>
              <span className={row.className}>{row.sample}</span>
            </div>
          ))}
        </div>
        <Caption className="mt-2">Shape and spacing</Caption>
        <p className="m-0 text-[12px] leading-[1.6] text-muted">
          Radius 0 everywhere except avatars of people (circle). Hairline 1px borders. Spacing steps 4, 8, 12,
          16, 20, 24. Row heights: 34 tasks, 48 to 52 settings and projects. Rail 64, list column 600.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        <Caption>Components</Caption>
        <div className="flex flex-wrap items-center gap-2">
          <Button kbd="C">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Revoke</Button>
        </div>
        <div className="flex flex-col gap-2">
          <TextField aria-label="Default input" defaultValue="Default input" />
          <TextField
            aria-label="Focused input"
            defaultValue="Focused input"
            inputClassName="border-focus halo"
          />
          <TextField aria-label="Error input" defaultValue="Error input" isInvalid />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag>Person</Tag>
          <Tag tone="accent">Agent</Tag>
          <Tag>Revoked</Tag>
          <Kbd>Esc</Kbd>
          <Kbd>⌘↵</Kbd>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {STATUSES.map((status) => (
            <StatusSquare key={status} status={status} withLabel className="gap-2" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {PRIORITIES.map((priority) => (
            <PriorityGlyph key={priority} priority={priority} withLabel className="gap-2" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="flex items-center gap-2">
            <Avatar name="Ana Ruiz" hue={25} size="md" decorative />
            Person
          </span>
          <span className="flex items-center gap-2">
            <Avatar name="claude-dev" kind="agent" size="md" decorative />
            Agent
          </span>
          <Checkbox defaultSelected className="text-[12px]">
            Check
          </Checkbox>
          <RadioGroup aria-label="Radio" defaultValue="radio" className="inline-flex">
            <Radio value="radio" className="text-[12px]">
              Radio
            </Radio>
          </RadioGroup>
          <Switch defaultSelected className="text-[12px] text-fg">
            Toggle
          </Switch>
        </div>
        <Banner>Error banner</Banner>
        <CodeBlock>pm tasks list --project PAY --json</CodeBlock>
        <div className="flex flex-col gap-2">
          <Skeleton width="80%" />
          <Skeleton width="55%" />
        </div>
      </div>
    </section>
  );
}
