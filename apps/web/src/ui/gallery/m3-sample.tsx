import type { OptionItem } from '../ListBox';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from '../meta';
import { PriorityGlyph } from '../PriorityGlyph';
import { StatusSquare } from '../StatusSquare';

/** Fixture data for the M3 gallery entries and tests (copy from the M3 canvas). */

export const STATUS_ITEMS: OptionItem[] = TASK_STATUSES.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusSquare status={status} />,
}));

export const PRIORITY_ITEMS: OptionItem[] = PRIORITIES.map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  prefix: <PriorityGlyph priority={priority} />,
}));

export const ASSIGNEE_ITEMS: OptionItem[] = [
  { id: 'none', label: 'No one' },
  { id: 'claude', label: 'claude-dev', avatar: { name: 'claude-dev', kind: 'agent' } },
  { id: 'ana', label: 'Ana Ruiz', avatar: { name: 'Ana Ruiz', kind: 'person', hue: 25 } },
  { id: 'codex', label: 'codex-ci', avatar: { name: 'codex-ci', kind: 'agent', initials: 'X' } },
];

export const WEBHOOK_URL = 'https://pm.example.com/api/webhooks/backlog/01JB7Q4X2M9K';

export const TASK_FILE =
  'backlog/tasks/back-786 - Retry-failed-webhook-deliveries-with-exponential-backoff.md';
