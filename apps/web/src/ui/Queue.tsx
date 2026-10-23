import { type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cn } from './cn';
import { Kbd } from './Kbd';

/**
 * The dashboard action queue (ledger-m4.css): one boxed surface with a header, then groups, each a
 * header line and rows. Rows are generic: they take cells as children and the screen picks the columns.
 */

type HeadingLevel = 2 | 3 | 4;

function Heading({
  level,
  className,
  children,
  id,
}: {
  level: HeadingLevel;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={cn('m-0 text-inherit', className)}>
      {children}
    </Tag>
  );
}

// ── Surface ─────────────────────────────────────────────────────────────────────────────────────────

export interface QueueProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** "Needs you" (Mine) or "Needs someone" (Everyone). */
  title: ReactNode;
  /** Total shown after the title in mono. Omit it while loading. */
  count?: number;
  /** Right-aligned faint note in the header. */
  note?: ReactNode;
  /** Level of the title heading (default 2). */
  headingLevel?: HeadingLevel;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/** The page's one boxed surface: --surface ground, 1px --line border, 2px --fg top rule, 48px header. */
export function Queue({ title, count, note, headingLevel = 2, className, children, ...props }: QueueProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      {...props}
      className={cn(
        'flex flex-none flex-col border border-t-2 border-line border-t-fg bg-surface',
        className,
      )}
    >
      <div className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <Heading level={headingLevel} id={titleId} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </Heading>
        {count !== undefined ? (
          <span data-part="count" className="font-mono text-[15px] font-medium text-fg">
            {count}
          </span>
        ) : null}
        <span className="flex-1" />
        {note ? <span className="text-[11.5px] text-faint">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

// ── Group header ────────────────────────────────────────────────────────────────────────────────────

export type QueueGroupKind = 'review' | 'mention' | 'stalled' | 'deadline';

export interface QueueGroupGlyphProps {
  kind: QueueGroupKind;
  className?: string;
}

/**
 * Group glyph. Shape tells the groups apart, colour only backs it: a --review square (In review), @ in
 * --mention (Mentions), a half-filled --warn square (Stalled), a --warn diamond (Deadlines). Decorative.
 */
export function QueueGroupGlyph({ kind, className }: QueueGroupGlyphProps) {
  const common = { 'aria-hidden': true, 'data-glyph': kind } as const;
  switch (kind) {
    case 'review':
      return <span {...common} className={cn('inline-block size-2 shrink-0 bg-review', className)} />;
    case 'mention':
      return (
        <span
          {...common}
          className={cn(
            'w-3.5 shrink-0 text-center font-mono text-[11px] font-medium tracking-normal text-mention',
            className,
          )}
        >
          @
        </span>
      );
    case 'stalled':
      return (
        <span
          {...common}
          style={{ background: 'linear-gradient(var(--warn), var(--warn)) left / 50% 100% no-repeat' }}
          className={cn('inline-block size-2 shrink-0 border-[1.5px] border-warn', className)}
        />
      );
    case 'deadline':
      return <span {...common} className={cn('inline-block size-2 shrink-0 rotate-45 bg-warn', className)} />;
  }
}

export interface QueueAction {
  /** "Show all 12", "Show all 50 of 120", "Collapse". */
  label: ReactNode;
  /** Without it the action renders as text with its key hint only. */
  onPress?: () => void;
  /** Key hint after the label (default "A"). */
  hotkey?: string;
}

function ActionHint({ action }: { action: QueueAction }) {
  const content = (
    <>
      {action.label}
      <Kbd aria-hidden>{action.hotkey ?? 'A'}</Kbd>
    </>
  );
  const cls =
    'inline-flex items-center gap-1.5 text-[11.5px] font-medium tracking-normal normal-case text-muted';
  if (!action.onPress) return <span className={cls}>{content}</span>;
  return (
    <AriaButton
      onPress={action.onPress}
      className={cn(cls, 'cursor-pointer outline-none hover:text-fg focus-visible:focus-ring')}
    >
      {content}
    </AriaButton>
  );
}

export interface QueueGroupHeaderProps extends HTMLAttributes<HTMLDivElement> {
  kind: QueueGroupKind;
  /** "In review", "Mentions", "Stalled", "Deadlines". Drawn uppercase. */
  label: string;
  count: number;
  /** Faint text after the count when the group is empty: "Nothing stalled". */
  emptyText?: string;
  /** "Show all 12" with its key hint, right-aligned before the group key. */
  showAll?: QueueAction;
  /** Group key hint on the right: "1" to "4". */
  hotkey?: string;
  /** Empty look (no band ground, faint text). Defaults to `count === 0`. */
  isEmpty?: boolean;
  /** Level of the label heading (default 3). */
  headingLevel?: HeadingLevel;
  ref?: Ref<HTMLDivElement>;
}

/**
 * 30px group line: glyph, uppercase name, count, then "Show all" and the group key on the right. On
 * --band; an empty group keeps its place as one faint line without the band.
 */
export function QueueGroupHeader({
  kind,
  label,
  count,
  emptyText,
  showAll,
  hotkey,
  isEmpty = count === 0,
  headingLevel = 3,
  className,
  ...props
}: QueueGroupHeaderProps) {
  return (
    <div
      {...props}
      data-group={kind}
      data-empty={isEmpty || undefined}
      className={cn(
        'flex h-[30px] flex-none items-center gap-2.5 border-b border-line-2 px-4 text-[11px] font-semibold tracking-[0.06em] uppercase outline-none focus-visible:focus-ring-inset',
        isEmpty ? 'text-faint' : 'bg-band text-fg',
        className,
      )}
    >
      <QueueGroupGlyph kind={kind} />
      <Heading level={headingLevel} className="text-[11px] font-semibold">
        {label}
      </Heading>
      <span data-part="count" className="font-mono text-[10px] tracking-normal text-faint">
        {count}
      </span>
      {isEmpty && emptyText ? (
        <span className="text-[11.5px] font-medium tracking-normal normal-case text-faint">{emptyText}</span>
      ) : null}
      <span className="flex-1" />
      {showAll && !isEmpty ? <ActionHint action={showAll} /> : null}
      {hotkey ? (
        <Kbd aria-hidden className="tracking-normal">
          {hotkey}
        </Kbd>
      ) : null}
    </div>
  );
}

export interface QueueGroupFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** "Showing 50 of 120. The rest stay here until they clear." */
  children: ReactNode;
  /** Right-aligned action, for example Collapse with A. */
  action?: QueueAction;
}

/** 32px muted line under an expanded group. */
export function QueueGroupFooter({ children, action, className, ...props }: QueueGroupFooterProps) {
  return (
    <div
      {...props}
      className={cn(
        'flex h-8 flex-none items-center gap-3 border-b border-line-2 px-4 text-[11.5px] text-muted',
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className="flex-1" />
      {action ? <ActionHint action={action} /> : null}
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────────────────────────────

/** Column sets from the design: full width, side panel open at 1280, side panel open at 1024. */
export const QUEUE_COLUMNS = {
  wide: '14px 64px minmax(0, 1fr) 128px 200px 34px 140px',
  panel: '14px 64px minmax(0, 1fr) 118px',
  narrow: '14px 64px minmax(0, 1fr) 96px',
} as const;

export interface QueueRowProps extends HTMLAttributes<HTMLDivElement> {
  /** `grid-template-columns` value. Share one value across groups so the columns line up. */
  columns?: string;
  /** Two-line layout for mention rows: cells align to the top, the first cell nudges down 3px. */
  twoLine?: boolean;
  /** Selected (its side panel is open): --sel ground and a 2px --accent left edge. */
  isSelected?: boolean;
  /**
   * Draw the keyboard focus ring (inset 2px --focus) whatever the DOM focus is: for roving focus with
   * aria-activedescendant. A row that takes DOM focus itself gets the ring on :focus-visible.
   */
  isFocused?: boolean;
  /** Force the hover ground (gallery and screenshots). Real hover works without it. */
  isHovered?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Queue row, at least 36px, a grid of the cells passed as children. States: default, hover (--band),
 * keyboard focus (inset 2px ring), selected (--sel with an --accent left edge). Each state is mirrored
 * in a data attribute: data-selected, data-focused, data-hovered, data-two-line.
 */
export function QueueRow({
  columns,
  twoLine = false,
  isSelected = false,
  isFocused = false,
  isHovered = false,
  className,
  style,
  ...props
}: QueueRowProps) {
  const gridStyle: CSSProperties | undefined = columns ? { gridTemplateColumns: columns, ...style } : style;
  return (
    <div
      {...props}
      style={gridStyle}
      data-selected={isSelected || undefined}
      data-focused={isFocused || undefined}
      data-hovered={isHovered || undefined}
      data-two-line={twoLine || undefined}
      className={cn(
        'grid min-h-9 items-center gap-3 border-b border-line-2 px-4',
        // outline-none would beat the forced ring, so it only applies when the ring is not forced.
        isFocused ? 'focus-ring-inset' : 'outline-none focus-visible:focus-ring-inset',
        twoLine && 'items-start pt-[7px] pb-2 [&>:first-child]:mt-[3px]',
        isSelected ? 'bg-sel shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-band',
        isHovered && !isSelected && 'bg-band',
        className,
      )}
    />
  );
}
