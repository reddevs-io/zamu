import {
  type OptionItem,
  PRIORITIES,
  PRIORITY_LABELS,
  PriorityGlyph,
  STATUS_LABELS,
  StatusGlyph,
} from '~/ui';
import { GROUP_ORDER } from './search';

// Status and priority as select options, for the M1–M4 filter bar (features/project-header/
// TaskFilterBar). The task view and quick create use the task-fields menus instead; remove this file
// with the filter bar.

export const STATUS_OPTIONS: OptionItem[] = GROUP_ORDER.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusGlyph status={status} decorative />,
}));

export const PRIORITY_OPTIONS: OptionItem[] = [...PRIORITIES].reverse().map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  prefix: (
    <span className="inline-flex w-4.5">
      <PriorityGlyph priority={priority} decorative />
    </span>
  ),
}));
