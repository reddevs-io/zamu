import type { AssigneeRef, Member, Priority, TaskStatus } from '@pm/contracts';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  cn,
  MemberLabel,
  type OptionItem,
  PRIORITIES,
  PRIORITY_LABELS,
  PriorityGlyph,
  Select,
  STATUS_LABELS,
  StatusSquare,
  TextArea,
} from '~/ui';
import { toggleCheckbox } from './format';
import { Markdown } from './Markdown';
import { GROUP_ORDER } from './search';

// Editable pieces shared by the detail pane and the task page: the title, the description and the
// status, priority and assignee pickers. Text saves on blur or Mod+Enter; Esc puts the old text back.

const isModEnter = (event: KeyboardEvent) => event.key === 'Enter' && (event.metaKey || event.ctrlKey);

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

export interface EditableTitleProps {
  value: string;
  onSave?: (title: string) => void;
  /** pane: 22px heading; page: 26px. */
  size?: 'pane' | 'page';
  /** Heading level of the title. */
  as?: 'h1' | 'h2';
}

const titleText = {
  pane: 'text-[22px] leading-[1.25] font-semibold tracking-[-0.015em]',
  page: 'text-[26px] leading-[1.25] font-semibold tracking-[-0.02em]',
};

export function EditableTitle({ value, onSave, size = 'pane', as: Heading = 'h2' }: EditableTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  if (draft === null || !onSave) {
    return (
      <Heading className={cn('m-0 text-pretty', titleText[size], size === 'page' && 'max-w-[760px]')}>
        {onSave ? (
          <button
            type="button"
            title="Edit title"
            onClick={() => setDraft(value)}
            className="-mx-1 w-[calc(100%+8px)] cursor-text px-1 text-left text-pretty outline-none hover:bg-band focus-visible:focus-ring"
          >
            {value}
          </button>
        ) : (
          value
        )}
      </Heading>
    );
  }

  const commit = () => {
    const next = draft.replace(/\s+/g, ' ').trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next && next !== value) onSave(next);
  };

  return (
    <TextArea
      aria-label="Title"
      autoFocus
      rows={1}
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          (event.target as HTMLTextAreaElement).blur();
        } else if (event.key === 'Escape') {
          cancelled.current = true;
          (event.target as HTMLTextAreaElement).blur();
        } else {
          event.continuePropagation();
        }
      }}
      className={cn('-mx-1', size === 'page' && 'max-w-[768px]')}
      inputClassName={cn(
        'field-sizing-content min-h-0 resize-none border-0 bg-band px-1 py-0 text-pretty focus:shadow-none',
        titleText[size],
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

export interface EditableDescriptionProps {
  value: string | null;
  onSave?: (description: string | null) => void;
  size?: 'pane' | 'page';
}

export function EditableDescription({ value, onSave, size = 'pane' }: EditableDescriptionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const source = value ?? '';

  if (draft === null || !onSave) {
    const edit = () => setDraft(source);
    if (!source.trim()) {
      return onSave ? (
        <button
          type="button"
          onClick={edit}
          className="-mx-1 cursor-text self-start px-1 text-left text-faint outline-none hover:text-muted focus-visible:focus-ring"
        >
          Add a description. Markdown works.
        </button>
      ) : null;
    }
    return (
      <div className="group relative">
        {/* Clicking the text starts editing; links and checkboxes keep working. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the Edit button below is the keyboard path */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the Edit button below is the keyboard path */}
        <div
          onClick={(event) => {
            if (!onSave) return;
            if ((event.target as HTMLElement).closest('a, button')) return;
            if (window.getSelection()?.toString()) return;
            edit();
          }}
          className={cn(onSave && 'cursor-text')}
        >
          <Markdown
            source={source}
            size={size}
            onToggleCheckbox={onSave ? (index) => onSave(toggleCheckbox(source, index)) : undefined}
          />
        </div>
        {onSave ? (
          <button
            type="button"
            onClick={edit}
            className="absolute -top-1 right-0 bg-bg px-1.5 text-[11.5px] text-muted opacity-0 outline-none group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:focus-ring"
          >
            Edit
          </button>
        ) : null}
      </div>
    );
  }

  const commit = () => {
    const next = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const normalized = next.trim() ? next : null;
    if (normalized !== (value?.trim() ? value : null)) onSave(normalized);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <TextArea
        aria-label="Description"
        autoFocus
        rows={6}
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        placeholder="Add a description. Markdown works."
        onKeyDown={(event) => {
          if (isModEnter(event)) {
            event.preventDefault();
            (event.target as HTMLTextAreaElement).blur();
          } else if (event.key === 'Escape') {
            cancelled.current = true;
            (event.target as HTMLTextAreaElement).blur();
          } else {
            event.continuePropagation();
          }
        }}
        inputClassName={cn(
          'field-sizing-content max-h-[60vh] min-h-[120px] font-mono text-[12px] leading-[1.6]',
          size === 'page' && 'max-w-[720px]',
        )}
      />
      <span className="text-[11.5px] text-faint">
        <ModKey />
        +Enter or click away to save · Esc to cancel
      </span>
    </div>
  );
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. Renders "Ctrl" on the server and fixes itself after hydration. */
export function ModKey() {
  const [apple, setApple] = useState(false);
  useEffect(() => {
    setApple(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return <>{apple ? '⌘' : 'Ctrl'}</>;
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

export const STATUS_OPTIONS: OptionItem[] = GROUP_ORDER.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusSquare status={status} />,
}));

export const PRIORITY_OPTIONS: OptionItem[] = [...PRIORITIES].reverse().map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  prefix: (
    <span className="inline-flex w-[18px]">
      <PriorityGlyph priority={priority} />
    </span>
  ),
}));

export const NO_ASSIGNEE = 'none';

export function assigneeOptions(members: readonly Member[], noneLabel = 'No assignee'): OptionItem[] {
  return [
    { id: NO_ASSIGNEE, label: noneLabel },
    ...members.map((member) => ({
      id: member.id,
      label: member.name,
      description: member.responsible ? `for ${member.responsible.name}` : undefined,
      avatar: { name: member.name, kind: member.kind },
    })),
  ];
}

export function memberToAssignee(member: Member): AssigneeRef {
  return { id: member.id, name: member.name, kind: member.kind, responsible: member.responsible };
}

/** Assignee name with its avatar, as in the list's Assignee column and the property grid. */
export function AssigneeLabel({ assignee, className }: { assignee: AssigneeRef; className?: string }) {
  return <MemberLabel name={assignee.name} kind={assignee.kind} className={className} />;
}

interface PickerProps<T extends string> {
  value: T;
  onChange?: (value: T) => void;
}

/** A property value that opens a list when pressed. Read-only when there is no onChange. */
function PropertySelect({
  label,
  items,
  value,
  onChange,
  children,
}: {
  label: string;
  items: OptionItem[];
  value: string;
  onChange?: (value: string) => void;
  children: ReactNode;
}) {
  if (!onChange) return <span className="flex min-w-0 items-center gap-1.5">{children}</span>;
  return (
    <Select
      aria-label={label}
      variant="filter"
      items={items}
      value={value}
      onChange={(key) => {
        if (key != null && String(key) !== value) onChange(String(key));
      }}
      className="-my-[5px] -ml-1 max-w-full min-w-0"
      renderValue={() => (
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-fg">{children}</span>
      )}
    />
  );
}

export function StatusPicker({ value, onChange }: PickerProps<TaskStatus>) {
  return (
    <PropertySelect
      label="Status"
      items={STATUS_OPTIONS}
      value={value}
      onChange={onChange ? (next) => onChange(next as TaskStatus) : undefined}
    >
      <StatusSquare status={value} withLabel />
    </PropertySelect>
  );
}

export function PriorityPicker({ value, onChange }: PickerProps<Priority>) {
  return (
    <PropertySelect
      label="Priority"
      items={PRIORITY_OPTIONS}
      value={value}
      onChange={onChange ? (next) => onChange(next as Priority) : undefined}
    >
      <PriorityGlyph priority={value} withLabel />
    </PropertySelect>
  );
}

export function AssigneePicker({
  value,
  members,
  onChange,
}: {
  value: AssigneeRef | null;
  members: readonly Member[];
  onChange?: (assignee: AssigneeRef | null) => void;
}) {
  const known = value && !members.some((member) => member.id === value.id);
  const items = assigneeOptions(members);
  // Keep a removed member visible while they are still the assignee.
  if (known && value)
    items.push({ id: value.id, label: value.name, avatar: { name: value.name, kind: value.kind } });
  return (
    <PropertySelect
      label="Assignee"
      items={items}
      value={value?.id ?? NO_ASSIGNEE}
      onChange={
        onChange
          ? (id) => {
              if (id === NO_ASSIGNEE) return onChange(null);
              const member = members.find((candidate) => candidate.id === id);
              if (member) onChange(memberToAssignee(member));
            }
          : undefined
      }
    >
      {value ? (
        <>
          <Avatar name={value.name} kind={value.kind} decorative />
          <span className="truncate">{value.name}</span>
        </>
      ) : (
        <span className="font-normal text-faint">No assignee</span>
      )}
    </PropertySelect>
  );
}
