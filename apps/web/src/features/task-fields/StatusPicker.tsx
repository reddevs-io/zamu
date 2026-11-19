import {
  PRIORITY_LABELS,
  type Priority,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskStatus,
} from '@zamu/contracts';
import { PickerMenu, type PickerMenuItem, PriorityGlyph, StatusGlyph } from '~/ui';
import { useFieldChange } from './apply';
import { commonValue, FieldPopover, type PickerAnchorProps, READ_ONLY_HINTS, ReadOnlyLine } from './shared';
import { type FieldTarget, fieldRefusal, toTargets } from './targets';

// Status (frame 078) and priority (079): number keys pick, the current value is checked.

/** Priorities in picker order: 0 none, 1 urgent … 4 low. */
export const PRIORITY_ORDER: readonly Priority[] = ['none', 'urgent', 'high', 'medium', 'low'];

interface MenuBase<V> {
  /** The current value; `mixed` when the selected tasks differ (nothing checked). */
  value: V | 'mixed';
  onChange: (value: V) => void;
  /** Mirrored: the value shows, nothing can change. */
  readOnly?: boolean;
  /** Why it is read-only (defaults to the Backlog.md lock text). */
  readOnlyText?: string;
  onClose?: () => void;
  autoFocus?: boolean;
}

export type StatusMenuProps = MenuBase<TaskStatus>;

export function StatusMenu({
  value,
  onChange,
  readOnly = false,
  readOnlyText,
  onClose,
  autoFocus,
}: StatusMenuProps) {
  const items: PickerMenuItem[] = TASK_STATUSES.map((status, index) => ({
    id: status,
    label: TASK_STATUS_LABELS[status],
    lead: <StatusGlyph status={status} decorative />,
    numberKey: String(index + 1),
    isDisabled: readOnly,
  }));
  return (
    <PickerMenu
      aria-label="Status"
      items={items}
      selectedKeys={value === 'mixed' ? [] : [value]}
      onAction={(id) => onChange(id as TaskStatus)}
      numberKeys={!readOnly}
      search={{ placeholder: 'Change status…', kbd: 'S' }}
      before={readOnly ? <ReadOnlyLine>{readOnlyText}</ReadOnlyLine> : undefined}
      footer={{ hints: readOnly ? READ_ONLY_HINTS : [{ keys: '1–6', label: 'pick' }] }}
      onClose={onClose}
      autoFocus={autoFocus}
    />
  );
}

export type PriorityMenuProps = MenuBase<Priority>;

export function PriorityMenu({
  value,
  onChange,
  readOnly = false,
  readOnlyText,
  onClose,
  autoFocus,
}: PriorityMenuProps) {
  const items: PickerMenuItem[] = PRIORITY_ORDER.map((priority, index) => ({
    id: priority,
    label: PRIORITY_LABELS[priority],
    lead: <PriorityGlyph priority={priority} decorative />,
    numberKey: String(index),
    isDisabled: readOnly,
  }));
  return (
    <PickerMenu
      aria-label="Priority"
      items={items}
      selectedKeys={value === 'mixed' ? [] : [value]}
      onAction={(id) => onChange(id as Priority)}
      numberKeys={!readOnly}
      search={{ placeholder: 'Set priority…', kbd: 'P' }}
      before={readOnly ? <ReadOnlyLine>{readOnlyText}</ReadOnlyLine> : undefined}
      footer={{ hints: readOnly ? READ_ONLY_HINTS : [{ keys: '0–4', label: 'pick' }] }}
      onClose={onClose}
      autoFocus={autoFocus}
    />
  );
}

/** Props of every wired picker: what it changes, and how it opens. */
export interface FieldPickerProps extends PickerAnchorProps {
  /** One task, or the selected tasks (bulk: native projects only). */
  targets: FieldTarget | readonly FieldTarget[];
  /** Called after the change was sent (the screen may move focus). */
  onChanged?: () => void;
}

export function StatusPicker({ targets, onChanged, ...anchor }: FieldPickerProps) {
  const list = toTargets(targets);
  const { apply } = useFieldChange();
  const reason = fieldRefusal(list, 'status');
  return (
    <FieldPopover label="Status" width={262} {...anchor}>
      {(close) => (
        <StatusMenu
          value={commonValue(list, (task) => task.status)}
          readOnly={reason != null}
          readOnlyText={reason ?? undefined}
          onClose={close}
          onChange={(status) => {
            void apply(list, { status });
            onChanged?.();
          }}
        />
      )}
    </FieldPopover>
  );
}

export function PriorityPicker({ targets, onChanged, ...anchor }: FieldPickerProps) {
  const list = toTargets(targets);
  const { apply } = useFieldChange();
  const reason = fieldRefusal(list, 'priority');
  return (
    <FieldPopover label="Priority" width={240} {...anchor}>
      {(close) => (
        <PriorityMenu
          value={commonValue(list, (task) => task.priority)}
          readOnly={reason != null}
          readOnlyText={reason ?? undefined}
          onClose={close}
          onChange={(priority) => {
            void apply(list, { priority });
            onChanged?.();
          }}
        />
      )}
    </FieldPopover>
  );
}
