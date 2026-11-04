import { type ReactNode, useState } from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Select as AriaSelect,
  DialogTrigger,
  SelectValue,
  ToggleButton,
  ToggleButtonGroup,
} from 'react-aria-components';
import {
  Button,
  CaretGlyph,
  cn,
  ListBox,
  type OptionItem,
  OptionRow,
  Popover,
  SegmentedControl,
  Switch,
} from '~/ui';
import {
  type BoardSubtasks,
  type DisplayOptions,
  GROUP_BY_LABELS,
  type GroupBy,
  HIDE_DONE_CHOICES,
  hideDoneLabel,
  LIST_SUBTASK_LABELS,
  LIST_SUBTASKS,
  type ListSubtasks,
  ORDER_BY_LABELS,
  ORDER_BYS,
  type OrderBy,
  PROPERTY_LABELS,
  TASK_PROPERTIES,
  type TaskProperty,
  type TaskViewName,
  type ViewLayout,
} from './display-options';
import { useViewRequests } from './requests';
import { useDisplayOptions } from './useDisplayOptions';

// Display options popover (frame 045; components.md "Display options"; margin.css .pop-sec,
// .pop-row, .selb, .tgl, .tg, .pop-foot). Changes apply at once and are saved for the person on
// this view ("Saved for you on this board").
//
//   <DisplayButton projectKey view …>   the header's Display slot: button + popover, wired to storage
//   <DisplayOptionsPanel …>             the panel alone, controlled (tests, other hosts)

const PANEL_WIDTH = 356;

export interface DisplayOptionsPanelProps {
  view: TaskViewName;
  options: DisplayOptions;
  onChange: (options: Partial<DisplayOptions>) => void;
  /** "Reset to default". Always offered, as in frame 045; a no-op on the defaults. */
  onReset: () => void;
  /** The Layout switch: the screen navigates to the other view. Omit to hide the switch. */
  onLayoutChange?: (layout: ViewLayout) => void;
  /** Grouping choices; leave out milestone and cycle when the project doesn't use them. */
  groupChoices?: readonly GroupBy[];
}

/** Compact select (.selb): 28px, at least 132px wide, value then ▾. */
function DisplaySelect<K extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: K;
  items: readonly OptionItem[];
  onChange: (value: K) => void;
}) {
  return (
    <AriaSelect
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null && key !== value) onChange(String(key) as K);
      }}
      className="inline-flex"
    >
      <AriaButton className="inline-flex h-7 min-w-33 cursor-pointer items-center gap-2 rounded-sm border border-line bg-bg pr-2.25 pl-2.75 text-sm font-medium text-fg outline-none hover:border-fg-3 focus-visible:shadow-[var(--focus-ring)] aria-expanded:border-accent">
        <SelectValue className="min-w-0 flex-1 truncate text-left">
          {({ selectedText }) => selectedText}
        </SelectValue>
        <CaretGlyph />
      </AriaButton>
      <Popover placement="bottom end">
        <ListBox items={items}>{(item) => <OptionRow item={item} />}</ListBox>
      </Popover>
    </AriaSelect>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <span className="flex-1 text-fg-2">{label}</span>
      {children}
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line-soft px-3 py-2.5 last:border-b-0">
      {title ? <div className="pt-0.5 pb-1 text-xs font-medium text-fg-3">{title}</div> : null}
      {children}
    </div>
  );
}

const options = <K extends string>(ids: readonly K[], labels: Record<K, string>): OptionItem[] =>
  ids.map((id) => ({ id, label: labels[id] }));

/** The panel: layout, grouping, order, subtasks, empty groups, hide done, properties, Reset. */
export function DisplayOptionsPanel({
  view,
  options: value,
  onChange,
  onReset,
  onLayoutChange,
  groupChoices = ['status', 'priority', 'assignee', 'milestone', 'cycle', 'label', 'none'],
}: DisplayOptionsPanelProps) {
  const board = view === 'board';
  const groupItems = options(groupChoices, GROUP_BY_LABELS);
  const laneItems = options(
    groupChoices.filter((choice) => choice === 'none' || choice !== value.groupBy),
    GROUP_BY_LABELS,
  );
  const noun = board ? 'cards' : 'rows';
  const place = view === 'home' ? 'on Home' : board ? 'on this board' : 'on this list';
  return (
    <div className="flex flex-col text-sm text-fg" style={{ width: PANEL_WIDTH }}>
      <Section>
        {view !== 'home' && onLayoutChange ? (
          <Row label="Layout">
            <SegmentedControl<ViewLayout>
              aria-label="Layout"
              items={[
                { id: 'list', label: 'List' },
                { id: 'board', label: 'Board' },
              ]}
              value={value.layout}
              onChange={onLayoutChange}
            />
          </Row>
        ) : null}
        {view !== 'home' ? (
          <Row label={board ? 'Columns' : 'Grouping'}>
            <DisplaySelect<GroupBy>
              label={board ? 'Columns' : 'Grouping'}
              value={value.groupBy}
              items={groupItems}
              onChange={(groupBy) =>
                onChange({ groupBy, ...(groupBy === value.swimlanes ? { swimlanes: 'none' } : {}) })
              }
            />
          </Row>
        ) : null}
        {board ? (
          <Row label="Swimlanes">
            <DisplaySelect<GroupBy>
              label="Swimlanes"
              value={value.swimlanes}
              items={laneItems}
              onChange={(swimlanes) => onChange({ swimlanes })}
            />
          </Row>
        ) : null}
        <Row label="Order by">
          <DisplaySelect<OrderBy>
            label="Order by"
            value={value.orderBy}
            items={options(ORDER_BYS, ORDER_BY_LABELS)}
            onChange={(orderBy) => onChange({ orderBy })}
          />
        </Row>
      </Section>
      <Section>
        {board ? (
          <Row label="Show subtasks as cards">
            <Switch
              aria-label="Show subtasks as cards"
              isSelected={value.boardSubtasks === 'cards'}
              onChange={(on) =>
                onChange({ boardSubtasks: (on ? 'cards' : 'expandable') satisfies BoardSubtasks })
              }
            />
          </Row>
        ) : (
          <Row label="Subtasks">
            <DisplaySelect<ListSubtasks>
              label="Subtasks"
              value={value.listSubtasks}
              items={options(LIST_SUBTASKS, LIST_SUBTASK_LABELS)}
              onChange={(listSubtasks) => onChange({ listSubtasks })}
            />
          </Row>
        )}
        {view !== 'home' ? (
          <Row label={board ? 'Show empty columns' : 'Show empty groups'}>
            <Switch
              aria-label={board ? 'Show empty columns' : 'Show empty groups'}
              isSelected={value.showEmptyGroups}
              onChange={(showEmptyGroups) => onChange({ showEmptyGroups })}
            />
          </Row>
        ) : null}
        <Row label="Hide done tasks after">
          <DisplaySelect<string>
            label="Hide done tasks after"
            value={String(value.hideDoneAfterDays)}
            items={HIDE_DONE_CHOICES.map((days) => ({ id: String(days), label: hideDoneLabel(days) }))}
            onChange={(days) => onChange({ hideDoneAfterDays: Number(days) })}
          />
        </Row>
      </Section>
      <Section title={`Shown on ${noun}`}>
        <ToggleButtonGroup
          aria-label={`Shown on ${noun}`}
          selectionMode="multiple"
          selectedKeys={TASK_PROPERTIES.filter((property) => value.properties[property])}
          onSelectionChange={(keys) =>
            onChange({
              properties: Object.fromEntries(
                TASK_PROPERTIES.map((property) => [property, keys.has(property)]),
              ) as Record<TaskProperty, boolean>,
            })
          }
          className="flex flex-wrap gap-1.5"
        >
          {TASK_PROPERTIES.map((property) => (
            <ToggleButton
              key={property}
              id={property}
              className={({ isSelected }) =>
                cn(
                  'inline-flex h-6.5 cursor-pointer items-center rounded-pill border px-2.5 text-sm font-medium outline-none select-none',
                  'focus-visible:shadow-[var(--focus-ring)]',
                  isSelected
                    ? 'border-transparent bg-accent-soft text-fg'
                    : 'border-line text-fg-3 hover:border-fg-3 hover:text-fg-2',
                )
              }
            >
              {PROPERTY_LABELS[property]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>
      <div className="flex items-center justify-between gap-2.5 px-3 py-2 text-xs text-fg-3">
        <span>Saved for you {place}</span>
        <Button variant="ghost" size="sm" onPress={onReset} className="h-6 px-0 text-xs text-accent-text">
          Reset to default
        </Button>
      </div>
    </div>
  );
}

export interface DisplayButtonProps {
  /** null on Home. */
  projectKey: string | null;
  view: TaskViewName;
  onLayoutChange?: (layout: ViewLayout) => void;
  groupChoices?: readonly GroupBy[];
  className?: string;
}

/**
 * The view header's Display button and its popover, reading and saving the person's options for
 * this project and view. Opens from the palette too (requestDisplayOptions()).
 */
export function DisplayButton({
  projectKey,
  view,
  onLayoutChange,
  groupChoices,
  className,
}: DisplayButtonProps) {
  const [displayOptions, set, reset] = useDisplayOptions(projectKey, view);
  const [open, setOpen] = useState(false);
  useViewRequests((request) => {
    if (request.kind === 'display') setOpen(true);
  });
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="quiet" className={cn(open && 'bg-bg-lane text-fg', className)}>
        Display
      </Button>
      <Popover placement="bottom start" offset={8} className="min-w-0 overflow-visible">
        <AriaDialog aria-label="Display options" className="outline-none">
          <DisplayOptionsPanel
            view={view}
            options={displayOptions}
            onChange={(change) => set(change)}
            onReset={reset}
            {...(onLayoutChange
              ? {
                  onLayoutChange: (layout: ViewLayout) => {
                    setOpen(false);
                    onLayoutChange(layout);
                  },
                }
              : {})}
            {...(groupChoices ? { groupChoices } : {})}
          />
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}
