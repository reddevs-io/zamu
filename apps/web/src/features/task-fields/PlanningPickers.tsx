import type { Cycle, CycleRef, MilestoneRef, MilestoneWithProgress } from '@zamu/contracts';
import { useNow } from '~/features/tasks/clock';
import { formatCalendarDay } from '~/features/tasks/format';
import {
  isMilestoneFilled,
  MenuNote,
  MilestoneGlyph,
  NoneGlyph,
  PickerMenu,
  type PickerMenuItem,
} from '~/ui';
import { useFieldChange } from './apply';
import {
  CycleStateGlyph,
  cycleLabel,
  cycleNote,
  toCycleRef,
  toMilestoneRef,
  useProjectPlanning,
} from './planning';
import type { FieldPickerProps } from './StatusPicker';
import { commonValue, FieldPopover, READ_ONLY_HINTS, ReadOnlyLine } from './shared';
import { fieldRefusal, isFieldLocked, projectKeysOf, toTargets } from './targets';

// Milestone (Shift+M) and cycle (Shift+C) on the picker menu. They list what a task can join:
// completed milestones and cycles only when they are the current value.

const NONE = '__none__';

export interface MilestoneMenuProps {
  value: MilestoneRef | null | 'mixed';
  milestones: readonly MilestoneWithProgress[] | undefined;
  onChange: (milestone: MilestoneRef | null) => void;
  readOnly?: boolean;
  /** Why it is read-only (defaults to the Backlog.md lock text). */
  readOnlyText?: string;
  onClose?: () => void;
  autoFocus?: boolean;
  now?: Date;
}

/** Rows for milestones: the target date at the right, in the danger colour when overdue. */
export function milestoneItems(
  milestones: readonly MilestoneWithProgress[] | undefined,
  current: MilestoneRef | null,
  now?: Date,
): PickerMenuItem[] {
  const rows: PickerMenuItem[] = (milestones ?? [])
    .filter((milestone) => milestone.status !== 'completed' || milestone.id === current?.id)
    .map((milestone) => ({
      id: milestone.id,
      label: milestone.name,
      lead: <MilestoneGlyph filled={isMilestoneFilled(milestone.status)} />,
      meta: milestone.targetDate ? (
        <span className={milestone.overdue ? 'font-semibold text-danger' : undefined}>
          {formatCalendarDay(milestone.targetDate, now)}
        </span>
      ) : (
        '–'
      ),
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

export function MilestoneMenu({
  value,
  milestones,
  onChange,
  readOnly = false,
  readOnlyText,
  onClose,
  autoFocus,
  now,
}: MilestoneMenuProps) {
  const current = value === 'mixed' ? null : value;
  const items: PickerMenuItem[] = [
    { id: NONE, label: 'No milestone', lead: <NoneGlyph /> },
    ...milestoneItems(milestones, current, now),
  ].map((item) => ({ ...item, isDisabled: readOnly }));
  return (
    <PickerMenu
      aria-label="Milestone"
      items={items}
      selectedKeys={value === 'mixed' ? [] : [value?.id ?? NONE]}
      onAction={(id) => {
        if (id === NONE) return onChange(null);
        const picked = milestones?.find((milestone) => milestone.id === id);
        if (picked) onChange(toMilestoneRef(picked));
      }}
      search={{ placeholder: 'Set milestone…', kbd: '⇧M' }}
      emptyText={milestones?.length === 0 ? 'No milestones yet' : 'No matches'}
      before={readOnly ? <ReadOnlyLine>{readOnlyText}</ReadOnlyLine> : undefined}
      footer={readOnly ? { hints: READ_ONLY_HINTS } : undefined}
      onClose={onClose}
      autoFocus={autoFocus}
    />
  );
}

export interface CycleMenuProps {
  value: CycleRef | null | 'mixed';
  cycles: readonly Cycle[] | undefined;
  onChange: (cycle: CycleRef | null) => void;
  readOnly?: boolean;
  /** Why it is read-only (defaults to the Backlog.md lock text). */
  readOnlyText?: string;
  onClose?: () => void;
  autoFocus?: boolean;
  now?: Date;
}

/** Rows for cycles: "current · 3d left" or the dates after the label. */
export function cycleItems(
  cycles: readonly Cycle[] | undefined,
  current: CycleRef | null,
  now?: Date,
): PickerMenuItem[] {
  const rows: PickerMenuItem[] = (cycles ?? [])
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

export function CycleMenu({
  value,
  cycles,
  onChange,
  readOnly = false,
  readOnlyText,
  onClose,
  autoFocus,
  now,
}: CycleMenuProps) {
  const current = value === 'mixed' ? null : value;
  const items: PickerMenuItem[] = [
    { id: NONE, label: 'No cycle', lead: <NoneGlyph shape="circle" /> },
    ...cycleItems(cycles, current, now),
  ].map((item) => ({ ...item, isDisabled: readOnly }));
  return (
    <PickerMenu
      aria-label="Cycle"
      items={items}
      selectedKeys={value === 'mixed' ? [] : [value?.id ?? NONE]}
      onAction={(id) => {
        if (id === NONE) return onChange(null);
        const picked = cycles?.find((cycle) => cycle.id === id);
        if (picked) onChange(toCycleRef(picked));
      }}
      search={{ placeholder: 'Set cycle…', kbd: '⇧C' }}
      emptyText={cycles?.length === 0 ? 'No cycles yet' : 'No matches'}
      before={readOnly ? <ReadOnlyLine>{readOnlyText}</ReadOnlyLine> : undefined}
      footer={readOnly ? { hints: READ_ONLY_HINTS } : undefined}
      onClose={onClose}
      autoFocus={autoFocus}
    />
  );
}

const sameId = (a: { id: string } | null, b: { id: string } | null) => (a?.id ?? null) === (b?.id ?? null);

function MilestoneContent({
  targets,
  close,
  onChanged,
}: {
  targets: FieldPickerProps['targets'];
  close: () => void;
  onChanged?: () => void;
}) {
  const list = toTargets(targets);
  const refusal = fieldRefusal(list, 'milestone');
  const projectKey = projectKeysOf(list).length === 1 ? list[0]?.project.key : undefined;
  const planning = useProjectPlanning(projectKey);
  const now = useNow();
  const { apply } = useFieldChange();
  const locked = list.length === 1 && isFieldLocked(list, 'milestone');
  if (refusal && !locked) return <RefusedMenu label="Milestone" text={refusal} onClose={close} />;
  if (planning.isKnown && !planning.usesMilestones) {
    return (
      <RefusedMenu
        label="Milestone"
        text="This project doesn't use milestones. Turn them on in project settings."
        onClose={close}
      />
    );
  }
  return (
    <MilestoneMenu
      value={commonValue(list, (task) => task.milestone, sameId)}
      milestones={planning.milestones}
      now={now != null ? new Date(now) : undefined}
      readOnly={locked}
      onClose={close}
      onChange={(milestone) => {
        void apply(list, { milestone });
        onChanged?.();
      }}
    />
  );
}

function CycleContent({
  targets,
  close,
  onChanged,
}: {
  targets: FieldPickerProps['targets'];
  close: () => void;
  onChanged?: () => void;
}) {
  const list = toTargets(targets);
  const refusal = fieldRefusal(list, 'cycle');
  const projectKey = projectKeysOf(list).length === 1 ? list[0]?.project.key : undefined;
  const planning = useProjectPlanning(projectKey);
  const now = useNow();
  const { apply } = useFieldChange();
  if (refusal) return <RefusedMenu label="Cycle" text={refusal} onClose={close} />;
  if (planning.isKnown && !planning.usesCycles) {
    return (
      <RefusedMenu
        label="Cycle"
        text="This project doesn't use cycles. Turn them on in project settings."
        onClose={close}
      />
    );
  }
  return (
    <CycleMenu
      value={commonValue(list, (task) => task.cycle, sameId)}
      cycles={planning.cycles}
      now={now != null ? new Date(now) : undefined}
      onClose={close}
      onChange={(cycle) => {
        void apply(list, { cycle });
        onChanged?.();
      }}
    />
  );
}

/** A menu that only explains why nothing can change (a selection across projects, feature off). */
function RefusedMenu({ label, text, onClose }: { label: string; text: string; onClose: () => void }) {
  return (
    <PickerMenu
      aria-label={label}
      items={[]}
      search={false}
      emptyText=""
      onClose={onClose}
      footer={{ hints: READ_ONLY_HINTS }}
    >
      <MenuNote>{text}</MenuNote>
    </PickerMenu>
  );
}

export function MilestonePicker({ targets, onChanged, ...anchor }: FieldPickerProps) {
  return (
    <FieldPopover label="Milestone" width={300} {...anchor}>
      {(close) => <MilestoneContent targets={targets} close={close} onChanged={onChanged} />}
    </FieldPopover>
  );
}

/** Cycles are app-side, so mirrored tasks can join one too (one at a time: bulk is native only). */
export function CyclePicker({ targets, onChanged, ...anchor }: FieldPickerProps) {
  return (
    <FieldPopover label="Cycle" width={280} {...anchor}>
      {(close) => <CycleContent targets={targets} close={close} onChanged={onChanged} />}
    </FieldPopover>
  );
}
