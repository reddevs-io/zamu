import { useState } from 'react';
import {
  Calendar,
  CloseGlyph,
  formatShortDate,
  localToday,
  MenuRowButton,
  PickerMenu,
  type PickerMenuItem,
} from '~/ui';
import { useFieldChange } from './apply';
import { formatDayWithWeekday, parseDueText, quickPicks, relativeDay } from './dates';
import type { FieldPickerProps } from './StatusPicker';
import { commonValue, FieldPopover, READ_ONLY_HINTS, ReadOnlyLine } from './shared';
import { fieldRefusal, toTargets } from './targets';

// Due date (frame 074): type a date ("nov 4", "tomorrow", "+3d"), or pick Today, Tomorrow, Next week,
// a day in the calendar, or Clear due date.

export interface DueMenuProps {
  /** YYYY-MM-DD, null for none, `mixed` when the selected tasks differ. */
  value: string | null | 'mixed';
  onChange: (dueDate: string | null) => void;
  /** Today as YYYY-MM-DD (defaults to the browser's day). */
  today?: string;
  readOnly?: boolean;
  /** Why it is read-only (defaults to the Backlog.md lock text). */
  readOnlyText?: string;
  onClose?: () => void;
  autoFocus?: boolean;
}

export function DueMenu({
  value,
  onChange,
  today = localToday(),
  readOnly = false,
  readOnlyText,
  onClose,
  autoFocus,
}: DueMenuProps) {
  const [query, setQuery] = useState('');
  const current = value === 'mixed' ? null : value;
  const typed = query.trim();
  const parsed = typed ? parseDueText(typed, today) : null;
  const items: PickerMenuItem[] = typed
    ? parsed
      ? [
          {
            id: `date:${parsed}`,
            label: formatDayWithWeekday(parsed, today),
            meta: relativeDay(parsed, today),
          },
        ]
      : []
    : quickPicks(today).map((pick) => ({
        // Ids stay apart when two picks share a day (on Sundays, Tomorrow is Next week).
        id: `${pick.id}:${pick.date}`,
        label: pick.label,
        meta: formatDayWithWeekday(pick.date, today),
        isDisabled: readOnly,
      }));
  const set = (date: string | null) => {
    if (readOnly) return;
    onChange(date);
    onClose?.();
  };
  return (
    <PickerMenu
      aria-label="Due date"
      selectionMode="none"
      items={readOnly ? items.map((item) => ({ ...item, isDisabled: true })) : items}
      query={query}
      onQueryChange={setQuery}
      onAction={(id) => {
        if (!readOnly) onChange(id.slice(id.indexOf(':') + 1));
      }}
      search={{ placeholder: 'Type a date: fri, in 2 weeks', kbd: '⇧D', filter: false }}
      emptyText="Type a date like nov 4, tomorrow or +3d"
      before={readOnly ? <ReadOnlyLine>{readOnlyText}</ReadOnlyLine> : undefined}
      footer={{
        hints: readOnly
          ? READ_ONLY_HINTS
          : [
              { keys: '↵', label: 'set' },
              { keys: '←→', label: 'day' },
            ],
        end: current ? `Now: ${formatShortDate(current, today)}` : undefined,
      }}
      onClose={onClose}
      autoFocus={autoFocus}
    >
      <div className="-mx-1.5 border-t border-line-soft pt-1">
        <Calendar value={parsed ?? current} onChange={(date) => set(date)} isDisabled={readOnly} />
      </div>
      <div className="-mx-1.5 border-t border-line-soft px-1.5 pt-1.5">
        <MenuRowButton
          isDisabled={readOnly || current === null}
          onPress={() => set(null)}
          trailing={
            <span className="text-fg-3">
              <CloseGlyph />
            </span>
          }
        >
          Clear due date
        </MenuRowButton>
      </div>
    </PickerMenu>
  );
}

export function DuePicker({ targets, onChanged, ...anchor }: FieldPickerProps) {
  const list = toTargets(targets);
  const { apply } = useFieldChange();
  const reason = fieldRefusal(list, 'dueDate');
  return (
    <FieldPopover label="Due date" width={264} {...anchor}>
      {(close) => (
        <DueMenu
          value={commonValue(list, (task) => task.dueDate ?? null)}
          readOnly={reason != null}
          readOnlyText={reason ?? undefined}
          onClose={close}
          onChange={(dueDate) => {
            void apply(list, { dueDate });
            onChanged?.();
          }}
        />
      )}
    </FieldPopover>
  );
}
