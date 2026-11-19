import type { ReactNode } from 'react';
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

/**
 * The Margin (M5) tokens from styles/tokens.css (.agent/design/m5/tokens.css): colours, type scale,
 * fonts, radii, elevation and spacing, then the kit components on them. Follows the page theme.
 */

const COLOR_GROUPS: { title: string; tokens: [string, string][] }[] = [
  {
    title: 'Surfaces',
    tokens: [
      ['--bg', 'page'],
      ['--bg-side', 'sidebar'],
      ['--bg-lane', 'board columns, selected menu items, pills'],
      ['--bg-grp', 'label chips, segmented control, hovered rows'],
      ['--surface', 'cards, inputs, comments'],
      ['--surface-hover', 'hovered cards'],
      ['--surface-pop', 'popovers, dialogs, palette, peek'],
    ],
  },
  {
    title: 'Lines and text',
    tokens: [
      ['--line', 'borders that separate'],
      ['--line-soft', 'dividers inside a surface'],
      ['--fg', 'primary text'],
      ['--fg-2', 'secondary text'],
      ['--fg-3', 'hints, keys, counts, placeholders'],
    ],
  },
  {
    title: 'Accent and feedback',
    tokens: [
      ['--accent', 'primary buttons, selection, focus, links'],
      ['--accent-ink', 'text on accent'],
      ['--accent-text', 'accent used as text'],
      ['--accent-soft', 'selected rows and cards'],
      ['--danger', 'overdue, Blocked, errors'],
      ['--danger-soft', 'Blocked chip, error ground'],
      ['--ok', 'success, On track'],
      ['--ok-soft', 'success ground'],
    ],
  },
  {
    title: 'Status and other',
    tokens: [
      ['--status-prog', 'In progress'],
      ['--status-rev', 'In review'],
      ['--status-done', 'Done'],
      ['--kbd-bg', 'key caps'],
      ['--scrim', 'behind dialogs'],
    ],
  },
];

const LABELS = [
  '--label-1',
  '--label-2',
  '--label-3',
  '--label-4',
  '--label-5',
  '--label-6',
  '--label-7',
  '--label-8',
  '--label-9',
];

const TYPE_SCALE: { name: string; spec: string; sample: string; className: string }[] = [
  { name: 'text-3xl', spec: '38 serif', sample: 'Nothing waits on you', className: 'font-serif text-3xl' },
  { name: 'text-2xl', spec: '30 serif', sample: 'Retry failed webhooks', className: 'font-serif text-2xl' },
  { name: 'text-xl', spec: '20 serif', sample: 'Payments', className: 'font-serif text-xl' },
  { name: 'text-lg', spec: '15', sample: 'Palette input, dialog body', className: 'text-lg' },
  { name: 'text-md', spec: '13.5 · base', sample: 'Rows, cards and body text', className: 'text-md' },
  { name: 'text-sm', spec: '12.5', sample: 'Menus, buttons, secondary UI', className: 'text-sm' },
  {
    name: 'text-xs',
    spec: '11.5',
    sample: 'PAY-142 · 3 of 5 · Due today',
    className: 'text-xs tabular-nums',
  },
];

const RADII: [string, string][] = [
  ['rounded-sm', 'inputs, menu items, kbd'],
  ['rounded-md', 'buttons, rows, cards'],
  ['rounded-lg', 'columns, popovers, dialogs'],
  ['rounded-pill', 'chips'],
];

const SHADOWS: [string, string][] = [
  ['shadow-card', 'board cards, comments'],
  ['shadow-pop', 'popovers, menus'],
  ['shadow-lift', 'dialogs, palette, peek, toasts'],
];

const SPACING = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--space-8',
];
const SPACING_PX = [4, 6, 8, 12, 16, 24, 32, 48];

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('m-0 text-sm font-semibold text-fg-2', className)}>{children}</h3>;
}

function Token({ children }: { children: ReactNode }) {
  return <code className="font-sans text-xs font-medium text-fg">{children}</code>;
}

function Swatch({ name, use }: { name: string; use: string }) {
  return (
    <div className="contents">
      <span className="size-6 rounded-sm border border-line" style={{ background: `var(${name})` }} />
      <span className="min-w-0 truncate text-xs">
        <Token>{name}</Token> <span className="text-fg-3">{use}</span>
      </span>
    </div>
  );
}

export function TokensSheet() {
  return (
    <section
      aria-label="Tokens and components"
      className="grid w-[1280px] grid-cols-[1.1fr_1fr_1fr] gap-8 bg-bg px-10 py-8 text-fg"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="m-0 font-serif text-xl font-medium">Margin tokens</h2>
        {COLOR_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <Heading>{group.title}</Heading>
            <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1">
              {group.tokens.map(([name, use]) => (
                <Swatch key={name} name={name} use={use} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Heading>Label palette (--label-1 to --label-9) and project tiles</Heading>
          <div className="flex flex-wrap items-center gap-2">
            {LABELS.map((name, index) => (
              <span
                key={name}
                className="inline-flex h-5 items-center gap-1.5 rounded-pill bg-bg-grp pr-2 pl-1.5 text-xs font-medium text-fg-2"
              >
                <span className="size-[7px] rounded-full" style={{ background: `var(${name})` }} />
                {index + 1}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {LABELS.slice(0, 6).map((name, index) => (
              <span
                key={name}
                className="grid size-6 place-items-center rounded-sm text-xs font-semibold text-tile-ink"
                style={{ background: `var(${name})` }}
              >
                {'PAWBIM'[index]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Heading>Type scale</Heading>
          <div className="flex flex-col gap-2">
            {TYPE_SCALE.map((row) => (
              <div key={row.name} className="flex flex-col gap-0.5 border-b border-line-soft pb-2">
                <span className="text-xs text-fg-3 tabular-nums">
                  <Token>{row.name}</Token> · {row.spec}
                </span>
                <span className={cn('truncate', row.className)}>{row.sample}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Heading>Fonts</Heading>
          <p className="m-0 text-sm">
            <span className="font-sans font-semibold">Onest</span>{' '}
            <span className="text-fg-3">UI, keys and numbers, with tabular figures (font-sans)</span>
          </p>
          <p className="m-0 text-sm">
            <span className="font-serif text-lg font-medium">Newsreader</span>{' '}
            <span className="text-fg-3">page, task and dialog titles (font-serif)</span>
          </p>
          <p className="m-0 text-sm">
            <span className="font-mono">ui-monospace</span>{' '}
            <span className="text-fg-3">code only (font-mono reads --font-code)</span>
          </p>
          <p className="m-0 text-sm text-fg-2">
            Line heights: <Token>leading-tight</Token> 1.15 serif titles, <Token>leading-ui</Token> 1.4 UI,{' '}
            <Token>leading-prose</Token> 1.6 descriptions and comments.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Heading>Radius</Heading>
          <div className="grid grid-cols-4 gap-3">
            {RADII.map(([name, use]) => (
              <div key={name} className="flex flex-col gap-1">
                <span className={cn('h-10 border border-line bg-surface', name)} />
                <Token>{name}</Token>
                <span className="text-xs text-fg-3">{use}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Heading>Elevation</Heading>
          <div className="grid grid-cols-3 gap-4 bg-bg-lane p-4">
            {SHADOWS.map(([name, use]) => (
              <div
                key={name}
                className={cn('flex min-h-16 flex-col justify-end gap-0.5 rounded-md bg-surface p-2', name)}
              >
                <Token>{name}</Token>
                <span className="text-xs text-fg-3">{use}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Heading>Spacing (--space-1 to --space-8) and sizes</Heading>
          <div className="flex items-end gap-2">
            {SPACING.map((name, index) => (
              <span key={name} className="flex flex-col items-center gap-1 text-xs text-fg-3 tabular-nums">
                <span
                  className="block bg-accent-soft"
                  style={{ width: `var(${name})`, height: `var(${name})` }}
                />
                {SPACING_PX[index]}
              </span>
            ))}
          </div>
          <p className="m-0 text-xs text-fg-3">
            Row 38 · view header 52 · sidebar 236, 52 collapsed. Rows, cards and popovers use 4, 8 and 12;
            page gutters 16 to 24.
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Heading>Components</Heading>
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
            inputClassName="border-accent halo"
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {STATUSES.map((status) => (
            <StatusSquare key={status} status={status} withLabel className="gap-2" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {PRIORITIES.map((priority) => (
            <PriorityGlyph key={priority} priority={priority} withLabel className="gap-2" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Avatar name="Ana Ruiz" hue={25} size="md" decorative />
            Person
          </span>
          <span className="flex items-center gap-2">
            <Avatar name="claude-dev" kind="agent" size="md" decorative />
            Agent
          </span>
          <Checkbox defaultSelected className="text-sm">
            Check
          </Checkbox>
          <RadioGroup aria-label="Radio" defaultValue="radio" className="inline-flex">
            <Radio value="radio" className="text-sm">
              Radio
            </Radio>
          </RadioGroup>
          <Switch defaultSelected className="text-sm text-fg">
            Toggle
          </Switch>
        </div>
        <Banner>Error banner</Banner>
        <CodeBlock>zamu tasks list --project PAY --json</CodeBlock>
        <div className="flex flex-col gap-2">
          <Skeleton width="80%" />
          <Skeleton width="55%" />
        </div>
      </div>
    </section>
  );
}
