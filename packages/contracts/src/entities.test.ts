import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cliDataSchemas } from './cli';
import {
  ACTIVITY_TYPES,
  Activity,
  ActivityList,
  ApiKeyCreated,
  ApiKeyMetadata,
  ApiKeySummary,
  BacklogBlock,
  BacklogDetection,
  BacklogMappings,
  BacklogPreview,
  BacklogProblem,
  BacklogRefreshResult,
  BacklogSourceStatus,
  BacklogWebhookInfo,
  Comment,
  CommentList,
  Cycle,
  CycleDetail,
  CycleList,
  CycleRollover,
  GitConnection,
  GitConnectionDeleted,
  GitConnectionList,
  GitConnectionTestResult,
  Invitation,
  Me,
  Member,
  MemberList,
  Milestone,
  MilestoneList,
  MilestoneWithProgress,
  milestoneProgressRatio,
  PROJECT_ACTIVITY_TYPES,
  Project,
  ProjectActivity,
  ProjectList,
  ProjectWithCounts,
  TASK_ACTIVITY_TYPES,
  TASK_CHANGED,
  Task,
  TaskChangedData,
  TaskListItem,
  TaskListPage,
  Timeline,
  TimelineItem,
} from './entities';
import * as inputs from './inputs';
import { Problem, problem } from './problem';
import {
  activityFixture,
  apiKeyCreatedFixture,
  apiKeySummaryFixture,
  commentFixture,
  completedCycleFixture,
  cycleFixture,
  cycleRolloverFixture,
  deletedCommentFixture,
  invitationFixture,
  meFixture,
  memberFixture,
  milestoneFixture,
  milestoneWithProgressFixture,
  projectFixture,
  projectId,
  projectWithCountsFixture,
  systemActivityFixture,
  taskFixture,
  taskListItemFixture,
  taskListPageFixture,
  timelineFixture,
} from './testing/fixtures';

const cases: [string, z.ZodType, unknown][] = [
  ['Project', Project, projectFixture],
  ['ProjectWithCounts', ProjectWithCounts, projectWithCountsFixture],
  ['ProjectList', ProjectList, { items: [projectWithCountsFixture] }],
  ['Task', Task, taskFixture],
  ['TaskListItem', TaskListItem, taskListItemFixture],
  ['TaskListPage', TaskListPage, taskListPageFixture],
  ['Activity', Activity, activityFixture],
  ['Activity by the system', Activity, systemActivityFixture],
  ['ActivityList', ActivityList, { items: [activityFixture, systemActivityFixture] }],
  ['TaskChangedData', TaskChangedData, { task: taskFixture }],
  ['Milestone', Milestone, milestoneFixture],
  ['MilestoneWithProgress', MilestoneWithProgress, milestoneWithProgressFixture],
  ['MilestoneList', MilestoneList, { items: [milestoneWithProgressFixture] }],
  ['Cycle', Cycle, cycleFixture],
  ['CycleRollover', CycleRollover, cycleRolloverFixture],
  ['CycleDetail', CycleDetail, completedCycleFixture],
  ['CycleList', CycleList, { items: [cycleFixture, completedCycleFixture] }],
  ['Comment', Comment, commentFixture],
  ['Comment deleted', Comment, deletedCommentFixture],
  ['CommentList', CommentList, { items: [commentFixture, deletedCommentFixture] }],
  ['TimelineItem', TimelineItem, timelineFixture[0]],
  ['Timeline', Timeline, { items: timelineFixture }],
  ['Member', Member, memberFixture],
  ['MemberList', MemberList, { items: [memberFixture] }],
  ['Invitation', Invitation, invitationFixture],
  ['ApiKeySummary', ApiKeySummary, apiKeySummaryFixture],
  ['ApiKeyCreated', ApiKeyCreated, apiKeyCreatedFixture],
  [
    'ApiKeyMetadata',
    ApiKeyMetadata,
    { workspaceId: '0190a1b2-0000-7000-8000-00000000d0d0', projects: [projectId], access: 'read' },
  ],
  ['Me', Me, meFixture],
  ['Problem', Problem, problem('NOT_FOUND', 'No task PAY-9', { requestId: 'req_8f2c41' })],
];

describe('round trip', () => {
  it.each(cases)('%s survives parse, JSON and parse again', (_name, schema, fixture) => {
    const first = schema.parse(fixture);
    const overTheWire = JSON.parse(JSON.stringify(first));
    expect(overTheWire).toEqual(first);
    expect(schema.parse(overTheWire)).toEqual(first);
  });

  it('turns server Dates into ISO strings', () => {
    const task = Task.parse(taskFixture);
    expect(task.createdAt).toBe('2026-10-20T09:00:00.000Z');
    expect(typeof task.updatedAt).toBe('string');
  });

  it('strips unknown fields, so internal columns never leak', () => {
    const parsed = Project.parse({ ...projectFixture, workspaceId: 'org_x', nextTaskNumber: 143 });
    expect(parsed).not.toHaveProperty('workspaceId');
    expect(parsed).not.toHaveProperty('nextTaskNumber');
  });

  it('never lets the secret into a key summary', () => {
    expect(ApiKeySummary.parse(apiKeyCreatedFixture)).not.toHaveProperty('key');
    expect(ApiKeyCreated.parse(apiKeyCreatedFixture).key).toMatch(/^pm_live_/);
  });

  it('rejects a created key without the pm_live_ prefix', () => {
    expect(
      ApiKeyCreated.safeParse({ ...apiKeyCreatedFixture, key: 'sk_live_abcdefghijklmnopqrst' }).success,
    ).toBe(false);
  });

  it('rejects a task whose key is not canonical', () => {
    expect(Task.safeParse({ ...taskFixture, key: 'pay-142' }).success).toBe(false);
  });

  it('rejects an activity change with a mismatched value', () => {
    const bad = { ...activityFixture, changes: [{ field: 'status', from: 'todo', to: 'started' }] };
    expect(Activity.safeParse(bad).success).toBe(false);
    const unknownField = { ...activityFixture, changes: [{ field: 'secret', from: 1, to: 2 }] };
    expect(Activity.safeParse(unknownField).success).toBe(false);
  });

  it('accepts a null actor (the system) and the M2 change fields', () => {
    const parsed = Activity.parse(systemActivityFixture);
    expect(parsed.actor).toBeNull();
    expect(parsed.type).toBe('cycle.ended');
    expect(parsed.changes[0]).toEqual({
      field: 'cycle',
      from: { id: systemActivityFixture.changes[0]?.from.id, number: 12, name: 'Checkout rewrite' },
      to: { id: systemActivityFixture.changes[0]?.to.id, number: 13, name: null },
    });
    const badCycle = { ...activityFixture, changes: [{ field: 'cycle', from: null, to: { id: projectId } }] };
    expect(Activity.safeParse(badCycle).success).toBe(false);
  });

  it('defaults the M2 fields for servers that do not send them yet', () => {
    const { usesMilestones: _m, usesCycles: _c, currentCycle: _cc, ...m1Project } = projectFixture;
    expect(Project.parse(m1Project)).toMatchObject({
      usesMilestones: true,
      usesCycles: true,
      currentCycle: null,
    });
    const { milestone: _ms, cycle: _cy, cycleAddedAt: _at, ...m1Task } = taskFixture;
    expect(Task.parse(m1Task)).toMatchObject({
      milestone: null,
      cycle: null,
      cycleAddedAt: null,
      rank: -1.5,
    });
    const { theme: _t, ...m1User } = meFixture.user;
    expect(Me.parse({ ...meFixture, user: m1User }).user.theme).toBe('system');
  });

  it('requires rank on tasks and the project on list items', () => {
    const { rank: _rank, ...noRank } = taskFixture;
    expect(Task.safeParse(noRank).success).toBe(false);
    const { project: _project, ...noProject } = taskListItemFixture;
    expect(TaskListItem.safeParse(noProject).success).toBe(false);
    expect(Task.safeParse({ ...taskFixture, rank: Number.NaN }).success).toBe(false);
  });

  it('keeps a deleted comment without a body', () => {
    const parsed = Comment.parse(deletedCommentFixture);
    expect(parsed.body).toBeNull();
    expect(parsed.deletedAt).toBe('2026-10-22T18:30:00.000Z');
  });

  it('tells timeline entries apart by kind', () => {
    const items = Timeline.parse({ items: timelineFixture }).items;
    expect(items.map((item) => item.kind)).toEqual(['activity', 'comment', 'comment', 'activity']);
    const first = items[1];
    if (first?.kind !== 'comment') throw new Error('expected a comment');
    expect(first.mentions[0]?.name).toBe('Ana Ruiz');
    expect(TimelineItem.safeParse({ ...commentFixture, kind: 'note' }).success).toBe(false);
    expect(TimelineItem.safeParse({ ...activityFixture, kind: 'comment' }).success).toBe(false);
  });

  it('computes milestone progress without canceled tasks', () => {
    expect(milestoneProgressRatio(milestoneWithProgressFixture.progress)).toBeCloseTo(14 / 22);
    expect(milestoneProgressRatio({ total: 2, done: 0, inProgress: 0, open: 0, canceled: 2 })).toBe(0);
  });

  it('rejects bad milestone and cycle values', () => {
    expect(Milestone.safeParse({ ...milestoneFixture, status: 'done' }).success).toBe(false);
    expect(Milestone.safeParse({ ...milestoneFixture, targetDate: '2026-11-14T00:00:00Z' }).success).toBe(
      false,
    );
    expect(Cycle.safeParse({ ...cycleFixture, state: 'active' }).success).toBe(false);
    expect(Cycle.safeParse({ ...cycleFixture, daysLeft: 0 }).success).toBe(false);
  });

  it('names the stale-write problem code', () => {
    expect(TASK_CHANGED).toBe('TASK_CHANGED');
  });

  it('rejects negative counts', () => {
    const bad = {
      ...projectWithCountsFixture,
      openCounts: { ...projectWithCountsFixture.openCounts, todo: -1 },
    };
    expect(ProjectWithCounts.safeParse(bad).success).toBe(false);
  });
});

describe('JSON Schema', () => {
  const inputSchemas = (Object.entries(inputs) as [string, unknown][]).filter(
    (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
  );
  const outputSchemas: [string, z.ZodType][] = [
    ...cases.map(([name, schema]) => [name, schema] as [string, z.ZodType]),
    ...Object.entries(cliDataSchemas).map(([name, schema]) => [`cli ${name}`, schema] as [string, z.ZodType]),
  ];

  it.each(inputSchemas)('input %s converts for OpenAPI', (_name, schema) => {
    expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
  });

  it.each(outputSchemas)('output %s converts for OpenAPI', (_name, schema) => {
    expect(() => z.toJSONSchema(schema, { io: 'output' })).not.toThrow();
  });

  it('describes timestamps as date-time strings', () => {
    const json = z.toJSONSchema(Project, { io: 'output' }) as { properties: Record<string, unknown> };
    expect(json.properties.createdAt).toEqual({
      type: 'string',
      format: 'date-time',
      pattern: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// M3: git connections and Backlog.md
// ---------------------------------------------------------------------------

const connectionId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4ac2';
const sourceId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4ad3';
const at = (iso: string) => new Date(iso);
const payRef = { id: projectId, key: 'PAY', name: 'Payments' };
const claude = { id: '0190a1b2-0000-7000-8000-00000000c0c0', name: 'claude-dev', kind: 'agent' as const };
const anaRef = { id: '0190a1b2-0000-7000-8000-00000000a0a0', name: 'Ana Ruiz', kind: 'person' as const };

const backlogSummary = {
  mode: 'mirror',
  state: 'warnings',
  defaultBranch: 'main',
  lastReadAt: at('2026-10-23T14:02:00Z'),
  lastReadCommit: 'a1b2c3d4e5f6',
  lastTrigger: 'webhook',
  problems: { files: 30, values: 1 },
  hidden: 9,
  detachedAt: null,
};

const mirroredTask = {
  ...taskFixture,
  key: 'PAY-786.1',
  number: 786,
  backlog: {
    id: 'BACK-786.1',
    file: 'backlog/tasks/back-786.1 - Honour-Retry-After.md',
    fileUrl:
      'https://gitlab.com/reddevs/payments/-/blob/main/backlog/tasks/back-786.1%20-%20Honour-Retry-After.md',
    data: {
      kind: 'task',
      status: 'In Progress',
      priority: 'high',
      milestone: 'm-3',
      assignees: [
        { value: '@claude', user: claude },
        { value: '@francis', user: null },
      ],
      reporter: '@ana',
      labels: ['webhooks', 'retries'],
      dependencies: [
        { id: 'BACK-805', task: { key: 'PAY-805', title: 'Signature check', status: 'todo', hidden: false } },
        { id: 'BACK-12', task: null },
      ],
      parent: {
        id: 'BACK-786',
        task: { key: 'PAY-786', title: 'Retry', status: 'in_progress', hidden: false },
      },
      subtasks: [],
      dueDate: '2026-11-14',
      type: 'feature',
      references: ['https://docs.stripe.com/webhooks#retries'],
      documentation: [],
      modifiedFiles: ['src/webhooks/delivery.ts'],
      createdDate: '2026-10-02 09:14',
      updatedDate: at('2026-10-22T10:00:00Z'),
      ordinal: 1000,
      other: { estimate: 5, customer: 'acme-retail' },
    },
  },
  locked: ['title', 'description', 'status', 'priority', 'assignee', 'milestone', 'createdAt'],
  hidden: false,
  hiddenAt: null,
};

const gitConnection = {
  id: connectionId,
  name: 'GitLab · reddevs',
  provider: 'gitlab',
  host: 'gitlab.com',
  status: 'working',
  apiBaseUrl: 'https://gitlab.com/api/v4',
  tokenHint: 'x9Q',
  checkedAt: at('2026-10-23T14:00:00Z'),
  checkedLogin: 'ana-ruiz',
  checkedDetail: null,
  usedBy: [{ ...payRef, paused: false }],
  createdBy: anaRef,
  createdAt: at('2026-10-20T09:00:00Z'),
  updatedAt: at('2026-10-23T14:00:00Z'),
};

const mappingsView = {
  status: [
    { from: 'To Do', to: 'todo', how: 'name', count: 24 },
    { from: 'Blocked', to: 'todo', how: 'fallback', count: 2 },
  ],
  priority: [{ from: 'high', to: 'high', how: 'name', count: 41 }],
  assignee: [
    { from: '@claude', userId: claude.id, how: 'name', count: 219, user: claude },
    { from: '@francis', userId: null, how: 'fallback', count: 5, user: null },
  ],
};

const fileProblem = {
  kind: 'file',
  path: 'backlog/tasks/back-12 - Split.md',
  backlogId: 'BACK-12',
  skipped: true,
  message: 'dependencies must be a flat list (line 9)',
};
const valueProblem = {
  kind: 'value',
  field: 'status',
  value: 'Blocked',
  count: 2,
  fallback: 'Todo',
  message: "status 'Blocked' is not mapped; shown as Todo",
};

const importedEntry = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4ae4',
  type: 'project.backlog_imported',
  actor: null,
  onBehalfOf: null,
  origin: 'backlog',
  originRef: 'a1b2c3d4e5f6',
  details: { mode: 'import', repository: 'gitlab.com/reddevs/payments', tasks: 412, milestones: 6 },
  createdAt: at('2026-10-23T14:02:00Z'),
};

const sourceStatus = {
  id: sourceId,
  project: payRef,
  mode: 'mirror',
  state: 'warnings',
  repository: 'git@gitlab.com:reddevs/payments.git',
  defaultBranch: 'main',
  folder: 'backlog',
  folderOverride: null,
  prefix: 'BACK',
  connection: {
    id: connectionId,
    name: 'GitLab · reddevs',
    provider: 'gitlab',
    host: 'gitlab.com',
    status: 'working',
  },
  headCommit: 'a1b2c3d4e5f6',
  lastRead: { at: at('2026-10-23T14:02:00Z'), trigger: 'webhook', commit: 'a1b2c3d4e5f6' },
  lastAttemptAt: at('2026-10-23T14:02:00Z'),
  lastTrigger: 'webhook',
  lastError: null,
  nextPollAt: at('2026-10-23T15:00:00Z'),
  webhookLastAt: at('2026-10-23T14:01:58Z'),
  counts: { tasks: 412, open: 38, drafts: 23, archived: 351, subtasks: 41, milestones: 6, hidden: 9 },
  problems: { items: [fileProblem, valueProblem], nextCursor: null, counts: { files: 1, values: 1 } },
  mappings: mappingsView,
  config: {
    projectName: 'Payments API',
    taskPrefix: 'BACK',
    statuses: ['To Do', 'In Progress', 'Done'],
    defaultStatus: 'To Do',
    priorities: ['high', 'medium', 'low'],
    labels: [],
    milestones: [],
    zeroPaddedIds: null,
  },
  createdBy: anaRef,
  createdAt: at('2026-10-23T14:00:00Z'),
  detachedAt: null,
  detachedBy: null,
  history: [importedEntry],
};

const detection = {
  repository: 'git@gitlab.com:reddevs/payments.git',
  access: 'ok',
  defaultBranch: 'main',
  headCommit: 'a1b2c3d4e5f6',
  headCommittedAt: at('2026-10-23T13:59:00Z'),
  folder: 'backlog',
  folderSource: 'default',
  config: sourceStatus.config,
  configError: null,
  folders: [
    { path: 'tasks/', count: 371, ignored: false },
    { path: 'docs/', count: 14, ignored: true },
  ],
  keyMatchesPrefix: false,
  mappings: mappingsView,
};

const preview = {
  commit: 'a1b2c3d4e5f6',
  defaultBranch: 'main',
  counts: {
    tasks: 412,
    open: 38,
    drafts: 23,
    archived: 351,
    completed: 12,
    subtasks: 41,
    milestones: 6,
    archivedMilestones: 2,
  },
  sample: [
    { backlogId: 'BACK-786.1', key: 'PAY-786.1', title: 'Honour Retry-After', status: 'todo', kind: 'task' },
    { backlogId: 'DRAFT-14', key: 'PAY-813', title: 'Idea', status: 'backlog', kind: 'draft' },
  ],
  files: [fileProblem],
  fallbacks: [valueProblem],
};

const testResult = {
  status: 'working',
  login: 'ana-ruiz',
  repoCount: 14,
  detail: null,
  checkedAt: at('2026-10-23T14:00:00Z'),
};

const m3Cases: [string, z.ZodType, unknown][] = [
  [
    'Project with a Backlog.md summary',
    Project,
    { ...projectFixture, backlog: backlogSummary, locked: ['key'] },
  ],
  [
    'ProjectWithCounts with a Backlog.md summary',
    ProjectWithCounts,
    { ...projectWithCountsFixture, backlog: backlogSummary },
  ],
  ['Task mirrored from Backlog.md', Task, mirroredTask],
  [
    'TaskListItem hidden',
    TaskListItem,
    {
      ...taskListItemFixture,
      key: 'PAY-786.3',
      backlogId: 'BACK-786.3',
      locked: ['status'],
      hidden: true,
      hiddenAt: at('2026-10-19T08:00:00Z'),
      commentCount: 3,
    },
  ],
  [
    'Milestone from Backlog.md',
    Milestone,
    { ...milestoneFixture, backlogId: 'm-3', locked: ['name'], hidden: false },
  ],
  [
    'Activity by Backlog.md',
    Activity,
    {
      ...activityFixture,
      actor: null,
      onBehalfOf: null,
      origin: 'backlog',
      originRef: 'a1b2c3d',
      backlogFields: ['labels'],
    },
  ],
  [
    'Activity task.hidden',
    Activity,
    { ...activityFixture, type: 'task.hidden', changes: [], origin: 'backlog' },
  ],
  ['ProjectActivity imported', ProjectActivity, importedEntry],
  [
    'ProjectActivity detached',
    ProjectActivity,
    {
      ...importedEntry,
      type: 'project.backlog_detached',
      actor: anaRef,
      origin: 'app',
      originRef: null,
      details: {},
    },
  ],
  ['GitConnection', GitConnection, gitConnection],
  ['GitConnectionList', GitConnectionList, { items: [gitConnection], encryptionReady: true }],
  ['GitConnectionTestResult', GitConnectionTestResult, testResult],
  ['GitConnectionDeleted', GitConnectionDeleted, { id: connectionId, pausedProjects: [payRef] }],
  ['BacklogSourceStatus', BacklogSourceStatus, sourceStatus],
  [
    'BacklogRefreshResult',
    BacklogRefreshResult,
    { project: 'PAY', state: 'reading', queued: true, lastAttemptAt: null },
  ],
  ['BacklogDetection', BacklogDetection, detection],
  ['BacklogPreview', BacklogPreview, preview],
  [
    'BacklogWebhookInfo',
    BacklogWebhookInfo,
    {
      url: 'https://projects.example.com/api/webhooks/backlog/wh_4kQz',
      secret: null,
      provider: 'gitlab',
      lastAt: null,
    },
  ],
  [
    'Problem TASK_MIRRORED',
    Problem,
    problem('TASK_MIRRORED', 'status comes from Backlog.md', {
      field: 'status',
      file: 'backlog/tasks/back-786 - Retry.md',
      backlogId: 'BACK-786',
      hint: 'backlog task edit 786 -s "In Progress"',
    }),
  ],
];

describe('M3 round trip', () => {
  it.each(m3Cases)('%s survives parse, JSON and parse again', (_name, schema, fixture) => {
    const first = schema.parse(fixture);
    const overTheWire = JSON.parse(JSON.stringify(first));
    expect(overTheWire).toEqual(first);
    expect(schema.parse(overTheWire)).toEqual(first);
  });

  it.each(m3Cases)('output %s converts for OpenAPI', (_name, schema) => {
    expect(() => z.toJSONSchema(schema, { io: 'output' })).not.toThrow();
  });
});

describe('M3 entities', () => {
  it('keeps pre-M3 shapes valid and leaves the new fields out', () => {
    const task = Task.parse(taskFixture);
    expect(task.backlog).toBeUndefined();
    expect(task.locked).toBeUndefined();
    expect(Project.parse(projectFixture).backlog).toBeUndefined();
    expect(Activity.parse(activityFixture).origin).toBeUndefined();
    expect(Milestone.parse(milestoneFixture).backlogId).toBeUndefined();
  });

  it('accepts suffixed task keys and rejects bad ones', () => {
    expect(Task.parse(mirroredTask).key).toBe('PAY-786.1');
    expect(Task.safeParse({ ...mirroredTask, key: 'PAY-786.0' }).success).toBe(false);
    expect(Task.safeParse({ ...mirroredTask, key: 'pay-786.1' }).success).toBe(false);
  });

  it('only accepts owned field names in locked', () => {
    expect(Task.safeParse({ ...mirroredTask, locked: ['cycle'] }).success).toBe(false);
    expect(Milestone.safeParse({ ...milestoneFixture, locked: ['progress'] }).success).toBe(false);
    expect(Project.safeParse({ ...projectFixture, locked: ['name'] }).success).toBe(false);
  });

  it('defaults every Backlog.md block field, so older rows stay readable', () => {
    expect(BacklogBlock.parse({})).toEqual({
      kind: 'task',
      status: null,
      priority: null,
      milestone: null,
      assignees: [],
      reporter: null,
      labels: [],
      dependencies: [],
      parentId: null,
      subtasks: [],
      dueDate: null,
      type: null,
      references: [],
      documentation: [],
      modifiedFiles: [],
      createdDate: null,
      updatedDate: null,
      ordinal: null,
      other: {},
    });
    const stored = BacklogBlock.parse({
      kind: 'draft',
      assignees: [{ value: '@claude', userId: claude.id }],
      updatedDate: at('2026-10-22T10:00:00Z'),
      other: { estimate: 5 },
    });
    expect(stored.updatedDate).toBe('2026-10-22T10:00:00.000Z');
    expect(BacklogBlock.safeParse({ kind: 'doc' }).success).toBe(false);
  });

  it('tells Backlog.md problems apart by kind', () => {
    expect(BacklogProblem.parse(fileProblem).kind).toBe('file');
    expect(BacklogProblem.parse(valueProblem).kind).toBe('value');
    expect(BacklogProblem.safeParse({ ...valueProblem, field: 'labels' }).success).toBe(false);
    expect(BacklogProblem.safeParse({ ...fileProblem, kind: 'config' }).success).toBe(false);
  });

  it('refuses mappings that map one value twice, ignoring case', () => {
    const ok = { status: [{ from: 'To Do', to: 'todo', how: 'name' }], priority: [], assignee: [] };
    expect(BacklogMappings.parse(ok)).toEqual(ok);
    const twice = {
      status: [
        { from: 'To Do', to: 'todo', how: 'name' },
        { from: 'to do', to: 'backlog', how: 'manual' },
      ],
      priority: [],
      assignee: [],
    };
    const result = BacklogMappings.safeParse(twice);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['status', 1, 'from']);
    expect(
      BacklogMappings.safeParse({ ...ok, status: [{ from: 'Doing', to: 'started', how: 'name' }] }).success,
    ).toBe(false);
    expect(
      BacklogMappings.safeParse({ ...ok, assignee: [{ from: '@x', userId: 'nobody', how: 'name' }] }).success,
    ).toBe(false);
    expect(
      BacklogMappings.safeParse({ ...ok, priority: [{ from: ' ', to: 'low', how: 'name' }] }).success,
    ).toBe(false);
    expect(
      BacklogMappings.safeParse({ ...ok, priority: [{ from: 'p1', to: 'low', how: 'guess' }] }).success,
    ).toBe(false);
  });

  it('never carries a token on a connection', () => {
    const parsed = GitConnection.parse({
      ...gitConnection,
      token: 'glpat-secret',
      tokenCiphertext: 'v1:abc',
    });
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('tokenCiphertext');
    expect(GitConnectionTestResult.safeParse({ ...testResult, status: 'unchecked' }).success).toBe(false);
  });

  it('lists the activity types by scope', () => {
    expect([...TASK_ACTIVITY_TYPES, ...PROJECT_ACTIVITY_TYPES].sort()).toEqual([...ACTIVITY_TYPES].sort());
    expect(ProjectActivity.safeParse({ ...importedEntry, type: 'task.updated' }).success).toBe(false);
  });
});
