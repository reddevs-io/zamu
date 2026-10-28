import type { Member } from '@pm/contracts';
import {
  type OptionItem,
  PRIORITIES,
  PRIORITY_LABELS,
  PriorityGlyph,
  STATUS_LABELS,
  StatusSquare,
  TASK_STATUSES,
} from '~/ui';
import { CREATE_AGENT, NO_ONE } from './mappings';

// Select options of the mapping tables: app statuses, priorities and members.

export const STATUS_OPTIONS: OptionItem[] = TASK_STATUSES.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusSquare status={status} />,
}));

/** Highest first, as the files usually list them (high, medium, low). */
export const PRIORITY_OPTIONS: OptionItem[] = [...PRIORITIES].reverse().map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  prefix: <PriorityGlyph priority={priority} />,
}));

/** One member in an assignee select. */
export function memberOption(member: Pick<Member, 'id' | 'name' | 'kind'>): OptionItem {
  return { id: member.id, label: member.name, avatar: { name: member.name, kind: member.kind } };
}

/** "No one", then people, then agents, each by name. */
export function assigneeOptions(members: readonly Pick<Member, 'id' | 'name' | 'kind'>[]): OptionItem[] {
  const sorted = [...members].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'person' ? -1 : 1,
  );
  return [{ id: NO_ONE, label: 'No one' }, ...sorted.map(memberOption)];
}

/** "Create agent claude…" at the top of an unmatched assignee row's select. */
export function createAgentOption(name: string): OptionItem {
  return {
    id: CREATE_AGENT,
    label: `Create agent ${name}…`,
    prefix: (
      <span
        aria-hidden
        className="grid size-[18px] place-items-center border-[1.5px] border-dashed border-muted text-[12px] leading-none text-muted"
      >
        +
      </span>
    ),
  };
}
