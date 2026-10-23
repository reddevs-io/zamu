import {
  type Cycle,
  type CycleRef,
  cycleLengthDays,
  type MilestoneRef,
  type MilestoneWithProgress,
  milestoneProgressRatio,
} from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode, RefObject } from 'react';
import {
  Button,
  CycleGlyph,
  cn,
  isMilestoneFilled,
  Kbd,
  MilestoneGlyph,
  NoneGlyph,
  type PickerItem,
  PickerPopover,
} from '~/ui';
import { useNow } from './clock';
import { formatCalendarDay, formatDateRange } from './format';
import { cyclesQuery, milestonesQuery, projectsQuery } from './queries';

// Milestone and cycle fields of a task: the pickers in the task panel, on the task page and in quick
// create. Both hide when the project has the feature turned off. Pickers list the milestones and cycles a
// task can join (completed ones only when they are the current value).

export interface ProjectPlanning {
  usesMilestones: boolean;
  usesCycles: boolean;
  /** Undefined while loading or when the project does not use milestones. */
  milestones: MilestoneWithProgress[] | undefined;
  cycles: Cycle[] | undefined;
}

/** The project's feature switches plus its milestones and cycles. Features count as off until known. */
export function useProjectPlanning(projectKey: string | undefined): ProjectPlanning {
  const project = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey),
    enabled: projectKey != null,
  }).data;
  const usesMilestones = project?.usesMilestones ?? false;
  const usesCycles = project?.usesCycles ?? false;
  const milestones = useQuery({
    ...milestonesQuery(projectKey ?? ''),
    enabled: projectKey != null && usesMilestones,
  }).data?.items;
  const cycles = useQuery({
    ...cyclesQuery(projectKey ?? ''),
    enabled: projectKey != null && usesCycles,
  }).data?.items;
  return { usesMilestones, usesCycles, milestones, cycles };
}

// ---------------------------------------------------------------------------
// Conversions and labels
// ---------------------------------------------------------------------------

export function toMilestoneRef(milestone: MilestoneWithProgress | MilestoneRef): MilestoneRef {
  return {
    id: milestone.id,
    name: milestone.name,
    status: milestone.status,
    targetDate: milestone.targetDate,
  };
}

export function toCycleRef(cycle: Cycle | CycleRef): CycleRef {
  return {
    id: cycle.id,
    number: cycle.number,
    name: cycle.name,
    startsOn: cycle.startsOn,
    endsOn: cycle.endsOn,
    state: cycle.state,
  };
}

/** "Cycle 12". */
export const cycleLabel = (cycle: { number: number }) => `Cycle ${cycle.number}`;

/** Elapsed share of a current cycle, from the days left the server counted in APP_TIME_ZONE. */
export function cycleElapsed(cycle: Pick<Cycle, 'startsOn' | 'endsOn' | 'daysLeft'>): number {
  const length = cycleLengthDays(cycle.startsOn, cycle.endsOn);
  if (cycle.daysLeft == null || length <= 0) return 0;
  return Math.min(1, Math.max(0, (length - cycle.daysLeft + 1) / length));
}

/** "3d left" for current cycles, "Oct 26 – Nov 8" for upcoming ones, "completed" for ended ones. */
export function cycleNote(cycle: CycleRef & { daysLeft?: number | null }, now?: Date): string {
  if (cycle.state === 'completed') return 'completed';
  if (cycle.state === 'current') return cycle.daysLeft != null ? `${cycle.daysLeft}d left` : 'current';
  return formatDateRange(cycle.startsOn, cycle.endsOn, now);
}

export function CycleStateGlyph({
  cycle,
  size,
}: {
  cycle: CycleRef & { daysLeft?: number | null };
  size?: number;
}) {
  if (cycle.state === 'completed') return <CycleGlyph state="done" size={size} />;
  if (cycle.state === 'current') {
    return (
      <CycleGlyph
        state="progress"
        size={size}
        progress={cycleElapsed({ ...cycle, daysLeft: cycle.daysLeft ?? null })}
      />
    );
  }
  return <CycleGlyph size={size} />;
}

const milestonePercent = (milestone: MilestoneWithProgress) =>
  `${Math.round(milestoneProgressRatio(milestone.progress) * 100)}%`;

/** Picker rows for milestones: target date at the right, in the warn colour when overdue. */
export function milestoneItems(
  milestones: readonly MilestoneWithProgress[] | undefined,
  current: MilestoneRef | null,
  now?: Date,
): PickerItem[] {
  const rows: PickerItem[] = (milestones ?? [])
    .filter((milestone) => milestone.status !== 'completed' || milestone.id === current?.id)
    .map((milestone) => ({
      id: milestone.id,
      label: milestone.name,
      lead: <MilestoneGlyph filled={isMilestoneFilled(milestone.status)} />,
      meta: milestone.targetDate ? formatCalendarDay(milestone.targetDate, now) : '–',
      metaTone: milestone.overdue ? 'warn' : 'default',
    }));
  if (current && !rows.some((row) => row.id === current.id)) {
    rows.unshift({
      id: current.id,
      label: current.name,
      lead: <MilestoneGlyph filled={isMilestoneFilled(current.status)} />,
      meta: current.targetDate ? formatCalendarDay(current.targetDate, now) : '–',
    });
  }
  return rows;
}

/** Picker rows for cycles: "current · 3d left" or the dates after the label. */
export function cycleItems(
  cycles: readonly Cycle[] | undefined,
  current: CycleRef | null,
  now?: Date,
): PickerItem[] {
  const rows: PickerItem[] = (cycles ?? [])
    .filter((cycle) => cycle.state !== 'completed' || cycle.id === current?.id)
    .map((cycle) => ({
      id: cycle.id,
      label: cycleLabel(cycle),
      textValue: cycle.name ? `${cycleLabel(cycle)} ${cycle.name}` : cycleLabel(cycle),
      lead: <CycleStateGlyph cycle={cycle} />,
      sub: cycle.state === 'current' ? `current · ${cycleNote(cycle, now)}` : cycleNote(cycle, now),
    }));
  if (current && !rows.some((row) => row.id === current.id)) {
    rows.unshift({
      id: current.id,
      label: cycleLabel(current),
      lead: <CycleStateGlyph cycle={current} />,
      sub: cycleNote(current, now),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** "◇ Webhooks v2 64%" in the property grid. */
export function MilestoneValue({
  value,
  milestones,
}: {
  value: MilestoneRef | null;
  milestones: readonly MilestoneWithProgress[] | undefined;
}) {
  if (!value) return <span className="font-normal text-faint">None</span>;
  const full = milestones?.find((milestone) => milestone.id === value.id);
  return (
    <>
      <MilestoneGlyph filled={isMilestoneFilled(full?.status ?? value.status)} />
      <span className="truncate">{value.name}</span>
      {full ? (
        <span className="shrink-0 text-[11.5px] font-normal text-muted">{milestonePercent(full)}</span>
      ) : null}
    </>
  );
}

/** "◕ Cycle 12 3d left" in the property grid. */
export function CycleValue({
  value,
  cycles,
}: {
  value: CycleRef | null;
  cycles: readonly Cycle[] | undefined;
}) {
  const now = useNow();
  if (!value) return <span className="font-normal text-faint">None</span>;
  const full = cycles?.find((cycle) => cycle.id === value.id);
  const shown = full ?? value;
  return (
    <>
      <CycleStateGlyph cycle={shown} />
      <span className="truncate">{cycleLabel(value)}</span>
      {now != null ? (
        <span className="shrink-0 truncate text-[11.5px] font-normal text-muted">
          {cycleNote(shown, new Date(now))}
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

interface PickerShared {
  /** Opened by Shift+M / Shift+C as well as by pressing the trigger. */
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Anchor for the popover (the property cell). Defaults to the trigger. */
  triggerRef?: RefObject<Element | null>;
}

/** Trigger looks: `property` reads as the value in a property cell, `chip` as a quick create chip. */
export type PlanningTriggerLook = 'property' | 'chip';

function triggerClass(look: PlanningTriggerLook, isOpen: boolean) {
  return look === 'chip'
    ? cn(
        'h-7 max-w-64 gap-[7px] border px-2.5 text-[12.5px] font-normal',
        isOpen ? 'border-focus bg-sel text-fg' : 'border-line bg-surface text-fg hover:bg-band',
      )
    : '-mx-1 h-auto max-w-[calc(100%+8px)] justify-start gap-1.5 px-1 text-[13px] text-fg hover:bg-band';
}

export interface MilestonePickerProps extends PickerShared {
  value: MilestoneRef | null;
  milestones: readonly MilestoneWithProgress[] | undefined;
  onChange: (milestone: MilestoneRef | null) => void;
  look?: PlanningTriggerLook;
  /** Trigger content. Defaults to the glyph and name, or "No milestone" in faint text. */
  children?: ReactNode;
}

export function MilestonePicker({
  value,
  milestones,
  onChange,
  isOpen,
  onOpenChange,
  triggerRef,
  look = 'property',
  children,
}: MilestonePickerProps) {
  const now = useNow();
  return (
    <PickerPopover
      aria-label="Milestone"
      items={milestoneItems(milestones, value, now != null ? new Date(now) : undefined)}
      value={value?.id ?? null}
      onChange={(id) => {
        onOpenChange(false);
        if (id === (value?.id ?? null)) return;
        if (id === null) return onChange(null);
        const picked = milestones?.find((milestone) => milestone.id === id);
        if (picked) onChange(toMilestoneRef(picked));
      }}
      none={{ label: 'No milestone', glyph: <NoneGlyph /> }}
      searchPlaceholder="Set milestone…"
      kbd="⇧M"
      emptyText={milestones?.length === 0 ? 'No milestones yet' : 'No matches'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
    >
      <Button
        variant="ghost"
        aria-label={value ? `Milestone: ${value.name}` : 'Milestone: none'}
        aria-keyshortcuts="Shift+M"
        className={triggerClass(look, isOpen)}
      >
        {children ??
          (value ? (
            <>
              <MilestoneGlyph filled={isMilestoneFilled(value.status)} />
              <span className="truncate">{value.name}</span>
            </>
          ) : (
            <span className="text-faint">Milestone</span>
          ))}
        {look === 'chip' && isOpen ? <Kbd aria-hidden>⇧M</Kbd> : null}
      </Button>
    </PickerPopover>
  );
}

export interface CyclePickerProps extends PickerShared {
  value: CycleRef | null;
  cycles: readonly Cycle[] | undefined;
  onChange: (cycle: CycleRef | null) => void;
  look?: PlanningTriggerLook;
  children?: ReactNode;
}

export function CyclePicker({
  value,
  cycles,
  onChange,
  isOpen,
  onOpenChange,
  triggerRef,
  look = 'property',
  children,
}: CyclePickerProps) {
  const now = useNow();
  return (
    <PickerPopover
      aria-label="Cycle"
      items={cycleItems(cycles, value, now != null ? new Date(now) : undefined)}
      value={value?.id ?? null}
      onChange={(id) => {
        onOpenChange(false);
        if (id === (value?.id ?? null)) return;
        if (id === null) return onChange(null);
        const picked = cycles?.find((cycle) => cycle.id === id);
        if (picked) onChange(toCycleRef(picked));
      }}
      none={{ label: 'No cycle', glyph: <NoneGlyph shape="circle" /> }}
      searchPlaceholder="Set cycle…"
      kbd="⇧C"
      emptyText={cycles?.length === 0 ? 'No cycles yet' : 'No matches'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      width={280}
    >
      <Button
        variant="ghost"
        aria-label={value ? `Cycle: ${cycleLabel(value)}` : 'Cycle: none'}
        aria-keyshortcuts="Shift+C"
        className={triggerClass(look, isOpen)}
      >
        {children ??
          (value ? (
            <>
              <CycleStateGlyph cycle={value} />
              <span className="truncate">{cycleLabel(value)}</span>
            </>
          ) : (
            <span className="text-faint">Cycle</span>
          ))}
        {look === 'chip' && isOpen ? <Kbd aria-hidden>⇧C</Kbd> : null}
      </Button>
    </PickerPopover>
  );
}
