import type { MemberKind } from '../Avatar';
import type { DataGroup } from '../DataTable';
import type { OptionItem } from '../ListBox';
import type { Priority, TaskStatus } from '../meta';

/** Fixture data for the /__ui gallery and component tests (copy from LgTasks.dc.html). */

export interface SampleMember {
  name: string;
  kind: MemberKind;
  hue?: number;
  initials?: string;
}

export const MEMBERS = {
  ana: { name: 'Ana Ruiz', kind: 'person', hue: 25 },
  tomas: { name: 'Tomás Berg', kind: 'person', hue: 220 },
  mira: { name: 'Mira Okafor', kind: 'person', hue: 145, initials: 'MO' },
  claude: { name: 'claude-dev', kind: 'agent' },
  codex: { name: 'codex-ci', kind: 'agent', initials: 'X' },
} satisfies Record<string, SampleMember>;

export interface SampleTask {
  key: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assignee?: SampleMember;
  updated: string;
}

const t = (
  key: string,
  title: string,
  status: TaskStatus,
  priority: Priority,
  assignee: SampleMember | undefined,
  updated: string,
): SampleTask => ({ key, title, status, priority, assignee, updated });

export const TASKS: SampleTask[] = [
  t(
    'PAY-142',
    'Retry failed webhook deliveries with exponential backoff',
    'in_progress',
    'high',
    MEMBERS.claude,
    '3m',
  ),
  t('PAY-131', 'Add idempotency keys to the refund endpoint', 'in_progress', 'urgent', MEMBERS.codex, '12m'),
  t(
    'PAY-139',
    'Stream invoice PDFs instead of buffering them in memory',
    'in_progress',
    'medium',
    MEMBERS.ana,
    '1h',
  ),
  t(
    'PAY-138',
    'Webhook signature check accepts expired timestamps',
    'in_review',
    'urgent',
    MEMBERS.claude,
    '25m',
  ),
  t('PAY-135', 'Paginate the transactions CSV export', 'in_review', 'medium', MEMBERS.tomas, '3h'),
  t('PAY-144', 'Show a test-mode banner on the billing settings page', 'todo', 'low', undefined, '2h'),
  t(
    'PAY-140',
    'Partial refunds across more than three line items round to the wrong cent when the invoice currency differs from the account currency',
    'todo',
    'high',
    MEMBERS.tomas,
    '5h',
  ),
  t('PAY-137', 'Document the nightly payout reconciliation job', 'todo', 'none', MEMBERS.claude, '1d'),
  t('PAY-129', 'Remove legacy v0 checkout routes', 'todo', 'medium', undefined, '2d'),
];

const byStatus = (status: TaskStatus) => TASKS.filter((task) => task.status === status);

export const TASK_GROUPS: DataGroup<SampleTask>[] = [
  { id: 'in_progress', label: 'In progress', status: 'in_progress', items: byStatus('in_progress') },
  { id: 'in_review', label: 'In review', status: 'in_review', items: byStatus('in_review') },
  { id: 'todo', label: 'Todo', status: 'todo', items: byStatus('todo') },
  { id: 'backlog', label: 'Backlog', status: 'backlog', count: 3, items: [] },
  { id: 'done', label: 'Done', status: 'done', count: 64, items: [] },
  { id: 'canceled', label: 'Canceled', status: 'canceled', count: 3, items: [] },
];

export const COLLAPSED_BY_DEFAULT = ['backlog', 'done', 'canceled'];

const STATUSES: TaskStatus[] = ['in_progress', 'in_review', 'todo', 'backlog'];
const PRIORITY_CYCLE: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
const PEOPLE = [MEMBERS.ana, MEMBERS.tomas, MEMBERS.claude, MEMBERS.codex, undefined];

/** n generated tasks, for the virtualization demo. */
export function manyTasks(n: number): SampleTask[] {
  return Array.from({ length: n }, (_, i) =>
    t(
      `WEB-${1000 + i}`,
      `Generated task ${i + 1}: tighten the ${['header', 'footer', 'sidebar', 'search', 'billing'][i % 5]} layout`,
      STATUSES[i % STATUSES.length] ?? 'todo',
      PRIORITY_CYCLE[i % PRIORITY_CYCLE.length] ?? 'none',
      PEOPLE[i % PEOPLE.length],
      `${(i % 59) + 1}m`,
    ),
  );
}

export const ASSIGNEE_OPTIONS: OptionItem[] = [
  { id: 'ana', label: 'Ana Ruiz', avatar: { name: 'Ana Ruiz', kind: 'person', hue: 25 } },
  { id: 'tomas', label: 'Tomás Berg', avatar: { name: 'Tomás Berg', kind: 'person', hue: 220 } },
  { id: 'claude', label: 'claude-dev', avatar: { name: 'claude-dev', kind: 'agent' } },
  { id: 'codex', label: 'codex-ci', avatar: { name: 'codex-ci', kind: 'agent', initials: 'X' } },
];
