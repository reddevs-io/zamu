// A Backlog.md source status for the project settings tests.
import type { BacklogSourceStatus, GitConnectionRef } from '@zamu/contracts';

const ANA = { id: '00000000-0000-7000-8000-0000000000a1', name: 'Ana Ruiz', kind: 'person' as const };

export const CONNECTION: GitConnectionRef = {
  id: '00000000-0000-7000-8000-000000000c01',
  name: 'GitLab · reddevs',
  provider: 'gitlab',
  host: 'gitlab.com',
  status: 'working',
};

export function sourceStatus(partial: Partial<BacklogSourceStatus> = {}): BacklogSourceStatus {
  return {
    id: '00000000-0000-7000-8000-000000000b01',
    project: { id: '00000000-0000-7000-8000-000000000001', key: 'PAY', name: 'Payments' },
    mode: 'mirror',
    state: 'healthy',
    repository: 'git@gitlab.com:reddevs/payments.git',
    defaultBranch: 'main',
    folder: 'backlog',
    folderOverride: null,
    prefix: 'BACK',
    connection: CONNECTION,
    headCommit: 'a1b2c3d4e5f6',
    lastRead: {
      at: '2026-10-23T11:57:00Z',
      trigger: 'webhook',
      commit: 'a1b2c3d4e5f6',
      commitUrl: null,
      commitTitle: 'Merge branch ‘back-786-webhook-retries’',
    },
    lastAttemptAt: '2026-10-23T11:57:00Z',
    lastTrigger: 'webhook',
    lastError: null,
    nextPollAt: '2026-10-23T12:57:00Z',
    webhookLastAt: '2026-10-23T11:57:00Z',
    counts: { tasks: 389, open: 35, drafts: 3, archived: 20, subtasks: 12, milestones: 6, hidden: 9 },
    problems: { items: [], nextCursor: null, counts: { files: 0, values: 0 } },
    mappings: {
      status: [
        { from: 'To Do', to: 'todo', how: 'name', count: 24 },
        { from: 'Blocked', to: 'todo', how: 'fallback', count: 2 },
      ],
      priority: [{ from: 'high', to: 'high', how: 'name', count: 4 }],
      assignee: [{ from: '@ana', userId: ANA.id, how: 'name', count: 3, user: ANA }],
    },
    config: null,
    createdBy: ANA,
    createdAt: '2026-10-20T10:00:00Z',
    detachedAt: null,
    detachedBy: null,
    history: [],
    ...partial,
  };
}

export const NOW = Date.parse('2026-10-23T12:00:00Z');
