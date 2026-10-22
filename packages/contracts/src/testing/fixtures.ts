import type { z } from 'zod';
import type {
  Activity,
  ApiKeyCreated,
  ApiKeySummary,
  Invitation,
  Me,
  Member,
  Project,
  ProjectWithCounts,
  Task,
  TaskListItem,
  TaskListPage,
  UserRef,
} from '../entities';

// Valid sample values for every entity schema, typed as server-side inputs (Dates allowed).
// Import from '@pm/contracts/testing/fixtures' in tests of other packages.

const at = (iso: string) => new Date(iso);

export const ana = {
  id: '0190a1b2-0000-7000-8000-00000000a0a0',
  name: 'Ana Ruiz',
  kind: 'person',
} satisfies z.input<typeof UserRef>;
export const tomas = {
  id: '0190a1b2-0000-7000-8000-00000000b0b0',
  name: 'Tomás Berg',
  kind: 'person',
} satisfies z.input<typeof UserRef>;
export const claudeDev = {
  id: '0190a1b2-0000-7000-8000-00000000c0c0',
  name: 'claude-dev',
  kind: 'agent',
} satisfies z.input<typeof UserRef>;

export const projectId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
export const taskId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c';
export const activityId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d';

export const projectFixture = {
  id: projectId,
  key: 'PAY',
  name: 'Payments',
  description: 'Checkout, refunds, webhooks and payouts',
  createdAt: at('2026-10-01T09:00:00.000Z'),
  updatedAt: '2026-10-20T10:30:00.000Z',
} satisfies z.input<typeof Project>;

export const projectWithCountsFixture = {
  ...projectFixture,
  openCounts: { backlog: 3, todo: 4, in_progress: 3, in_review: 2 },
  openCount: 12,
  lastActivityAt: at('2026-10-22T18:00:00.000Z'),
  assignees: [ana, claudeDev],
} satisfies z.input<typeof ProjectWithCounts>;

export const taskFixture = {
  id: taskId,
  key: 'PAY-142',
  number: 142,
  project: { id: projectId, key: 'PAY', name: 'Payments' },
  title: 'Retry failed webhook deliveries with exponential backoff',
  description: '- [x] Store attempt count\n- [ ] Stop on 4xx',
  status: 'in_progress',
  priority: 'high',
  assignee: { ...claudeDev, responsible: ana },
  createdBy: ana,
  createdOnBehalfOf: null,
  createdAt: at('2026-10-20T09:00:00.000Z'),
  updatedAt: at('2026-10-22T18:00:00.000Z'),
} satisfies z.input<typeof Task>;

export const taskListItemFixture = {
  id: taskId,
  key: 'PAY-142',
  number: 142,
  title: taskFixture.title,
  status: 'in_progress',
  priority: 'high',
  assignee: null,
  createdAt: taskFixture.createdAt,
  updatedAt: taskFixture.updatedAt,
} satisfies z.input<typeof TaskListItem>;

export const taskListPageFixture = {
  items: [taskListItemFixture],
  nextCursor: 'eyJzIjoxfQ',
  counts: { backlog: 3, todo: 4, in_progress: 3, in_review: 2, done: 64, canceled: 3 },
} satisfies z.input<typeof TaskListPage>;

export const activityFixture = {
  id: activityId,
  type: 'task.updated',
  taskKey: 'PAY-142',
  actor: claudeDev,
  onBehalfOf: ana,
  changes: [
    { field: 'status', from: 'todo', to: 'in_progress' },
    { field: 'assignee', from: null, to: claudeDev },
    { field: 'priority', from: 'medium', to: 'high' },
    { field: 'title', from: 'Retry webhooks', to: taskFixture.title },
    { field: 'description', from: null, to: 'Backoff is 30s × 2^n' },
  ],
  createdAt: at('2026-10-22T17:20:00.000Z'),
} satisfies z.input<typeof Activity>;

export const memberFixture = {
  id: claudeDev.id,
  name: claudeDev.name,
  email: null,
  kind: 'agent',
  role: 'member',
  responsible: ana,
  lastActiveAt: at('2026-10-22T18:00:00.000Z'),
  apiKeyCount: 1,
  joinedAt: at('2026-10-20T08:00:00.000Z'),
} satisfies z.input<typeof Member>;

export const invitationFixture = {
  id: '0190a1b2-0000-4000-8000-00000000f0f0',
  email: 'jo@example.com',
  role: 'member',
  status: 'pending',
  invitedBy: ana,
  link: 'https://pm.example.com/invite/0190a1b2-0000-4000-8000-00000000f0f0',
  expiresAt: at('2026-10-28T09:00:00.000Z'),
  createdAt: at('2026-10-21T09:00:00.000Z'),
} satisfies z.input<typeof Invitation>;

export const apiKeySummaryFixture = {
  id: '0190a1b2-0000-7000-8000-00000000e0e0',
  name: 'claude-dev on Ana’s laptop',
  start: 'pm_live_4kQz',
  owner: claudeDev,
  scope: { projects: [{ id: projectId, key: 'PAY', name: 'Payments' }], access: 'write' },
  revoked: false,
  createdAt: at('2026-10-20T08:00:00.000Z'),
  lastUsedAt: null,
  expiresAt: null,
} satisfies z.input<typeof ApiKeySummary>;

export const apiKeyCreatedFixture = {
  ...apiKeySummaryFixture,
  key: 'pm_live_7Hq2mV9xKc4TzR8bN3wLp6Ye1Ua5Fj0D',
} satisfies z.input<typeof ApiKeyCreated>;

export const meFixture = {
  user: { id: claudeDev.id, name: claudeDev.name, email: null, kind: 'agent', responsible: ana },
  workspace: { id: '0190a1b2-0000-7000-8000-00000000d0d0', name: 'Reddevs', slug: 'reddevs' },
  role: 'member',
  auth: { method: 'api_key', scope: { projects: 'all', access: 'read' } },
} satisfies z.input<typeof Me>;
