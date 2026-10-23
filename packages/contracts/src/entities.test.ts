import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cliDataSchemas } from './cli';
import {
  Activity,
  ActivityList,
  ApiKeyCreated,
  ApiKeyMetadata,
  ApiKeySummary,
  Comment,
  CommentList,
  Cycle,
  CycleDetail,
  CycleList,
  CycleRollover,
  DASHBOARD_GROUP_ITEM_LIMIT,
  Dashboard,
  DashboardAgent,
  DashboardCounts,
  DashboardProject,
  DeadlineItem,
  Invitation,
  Me,
  Member,
  MemberList,
  MentionItem,
  Milestone,
  MilestoneList,
  MilestoneWithProgress,
  milestoneProgressRatio,
  Project,
  ProjectList,
  ProjectWithCounts,
  ReviewItem,
  StalledItem,
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
  ana,
  apiKeyCreatedFixture,
  apiKeySummaryFixture,
  claudeDev,
  commentFixture,
  commentId,
  completedCycleFixture,
  cycleFixture,
  cycleRolloverFixture,
  deletedCommentFixture,
  invitationFixture,
  meFixture,
  memberFixture,
  milestoneFixture,
  milestoneId,
  milestoneWithProgressFixture,
  projectFixture,
  projectId,
  projectWithCountsFixture,
  systemActivityFixture,
  taskFixture,
  taskListItemFixture,
  taskListPageFixture,
  timelineFixture,
  tomas,
} from './testing/fixtures';

// Dashboard fixtures: every queue group filled, both deadline kinds.
const at = (iso: string) => new Date(iso);
const pay = { key: 'PAY', name: 'Payments' };
const claudeForAna = { ...claudeDev, responsible: ana };
const anaAssignee = { ...ana, responsible: null };

const reviewItem = {
  task: {
    key: 'PAY-142',
    title: 'Retry failed webhooks',
    status: 'in_review',
    priority: 'urgent',
    project: pay,
  },
  assignee: claudeForAna,
  since: at('2026-10-22T15:00:00.000Z'),
} satisfies z.input<typeof ReviewItem>;

const mentionItem = {
  task: { key: 'PAY-150', title: 'Refund flow', status: 'in_progress', priority: 'high', project: pay },
  comment: {
    id: commentId,
    excerpt: '@Ana Ruiz should `refund()` be idempotent?',
    createdAt: at('2026-10-22T17:00:00.000Z'),
  },
  author: claudeDev,
  onBehalfOf: ana,
  mentioned: anaAssignee,
} satisfies z.input<typeof MentionItem>;

const stalledItem = {
  task: { key: 'PAY-151', title: 'Payout report', status: 'in_progress', priority: 'medium', project: pay },
  assignee: claudeForAna,
  lastTouchedAt: '2026-10-21T08:00:00.000Z',
  thresholdHours: 24,
} satisfies z.input<typeof StalledItem>;

const milestoneDeadline = {
  kind: 'milestone',
  project: pay,
  milestone: { id: milestoneId, name: 'PCI audit', targetDate: '2026-10-12' },
  daysOverdue: 11,
  openTasks: 4,
  progress: { done: 14, total: 18 },
} satisfies z.input<typeof DeadlineItem>;

const cycleDeadline = {
  kind: 'cycle',
  project: pay,
  cycle: { number: 12, name: 'Checkout rewrite', startsOn: '2026-10-12', endsOn: '2026-10-24' },
  daysLeft: 2,
  openTasks: 7,
  progress: { done: 9, total: 16 },
} satisfies z.input<typeof DeadlineItem>;

const dashboardProject = {
  key: 'PAY',
  name: 'Payments',
  openCounts: { backlog: 3, todo: 4, in_progress: 3, in_review: 2 },
  openCount: 12,
  usesMilestones: true,
  usesCycles: true,
  lastActivityAt: at('2026-10-22T18:00:00.000Z'),
  currentCycle: {
    number: 12,
    name: 'Checkout rewrite',
    endsOn: '2026-10-24',
    daysLeft: 2,
    done: 9,
    total: 16,
  },
  nextMilestone: {
    id: milestoneId,
    name: 'PCI audit',
    targetDate: '2026-10-12',
    overdue: true,
    done: 14,
    total: 18,
    others: 2,
  },
} satisfies z.input<typeof DashboardProject>;

const plainProject = {
  key: 'OPS',
  name: 'Operations',
  openCounts: { backlog: 0, todo: 1, in_progress: 0, in_review: 0 },
  openCount: 1,
  usesMilestones: false,
  usesCycles: false,
  lastActivityAt: '2026-10-01T09:00:00.000Z',
  currentCycle: null,
  nextMilestone: null,
} satisfies z.input<typeof DashboardProject>;

const busyAgent = {
  agent: claudeForAna,
  currentTask: stalledItem.task,
  inProgressCount: 3,
  stalled: true,
  lastActivityAt: at('2026-10-22T17:00:00.000Z'),
} satisfies z.input<typeof DashboardAgent>;

const idleAgent = {
  agent: { id: '0190a1b2-0000-7000-8000-00000000e0e0', name: 'codex-ops', kind: 'agent', responsible: tomas },
  currentTask: null,
  inProgressCount: 0,
  stalled: false,
  lastActivityAt: null,
} satisfies z.input<typeof DashboardAgent>;

const fullDashboard = {
  scope: 'everyone',
  generatedAt: at('2026-10-23T09:00:00.000Z'),
  groups: {
    review: { total: 3, items: [reviewItem] },
    mentions: { total: 1, items: [mentionItem] },
    stalled: { total: 1, items: [stalledItem] },
    deadlines: { total: 2, items: [milestoneDeadline, cycleDeadline] },
  },
  projects: [dashboardProject, plainProject],
  agents: [busyAgent, idleAgent],
} satisfies z.input<typeof Dashboard>;

const emptyGroup = { total: 0, items: [] };
const emptyDashboard = {
  scope: 'mine',
  generatedAt: '2026-10-23T09:00:00.000Z',
  groups: { review: emptyGroup, mentions: emptyGroup, stalled: emptyGroup, deadlines: emptyGroup },
  projects: [],
  agents: [],
} satisfies z.input<typeof Dashboard>;

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
  ['ReviewItem', ReviewItem, reviewItem],
  ['MentionItem', MentionItem, mentionItem],
  ['StalledItem', StalledItem, stalledItem],
  ['DeadlineItem for a milestone', DeadlineItem, milestoneDeadline],
  ['DeadlineItem for a cycle', DeadlineItem, cycleDeadline],
  ['DashboardProject', DashboardProject, dashboardProject],
  ['DashboardProject without milestones or cycles', DashboardProject, plainProject],
  ['DashboardAgent', DashboardAgent, busyAgent],
  ['DashboardAgent idle', DashboardAgent, idleAgent],
  ['Dashboard', Dashboard, fullDashboard],
  ['Dashboard empty', Dashboard, emptyDashboard],
  ['DashboardCounts', DashboardCounts, { review: 3, mentions: 1, stalled: 1, deadlines: 2, total: 7 }],
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

describe('Dashboard', () => {
  it('parses a dashboard with every group filled', () => {
    const parsed = Dashboard.parse(fullDashboard);
    expect(parsed.scope).toBe('everyone');
    expect(parsed.generatedAt).toBe('2026-10-23T09:00:00.000Z');
    expect(parsed.groups.review.items[0]?.since).toBe('2026-10-22T15:00:00.000Z');
    expect(parsed.groups.mentions.items[0]?.mentioned).toEqual({ ...ana, responsible: null });
    expect(parsed.groups.stalled.items[0]?.thresholdHours).toBe(24);
    expect(parsed.groups.deadlines.items.map((item) => item.kind)).toEqual(['milestone', 'cycle']);
    expect(parsed.projects.map((project) => project.key)).toEqual(['PAY', 'OPS']);
    expect(parsed.agents[0]?.agent.responsible?.name).toBe('Ana Ruiz');
    expect(parsed.agents[1]?.currentTask).toBeNull();
  });

  it('parses an empty dashboard', () => {
    const parsed = Dashboard.parse(emptyDashboard);
    expect(parsed.groups.review).toEqual({ total: 0, items: [] });
    expect(parsed.projects).toEqual([]);
    expect(parsed.agents).toEqual([]);
  });

  it('tells deadline kinds apart', () => {
    const milestone = DeadlineItem.parse(milestoneDeadline);
    if (milestone.kind !== 'milestone') throw new Error('expected a milestone');
    expect(milestone.milestone.targetDate).toBe('2026-10-12');
    expect(milestone.daysOverdue).toBe(11);
    const cycle = DeadlineItem.parse(cycleDeadline);
    if (cycle.kind !== 'cycle') throw new Error('expected a cycle');
    expect(cycle.cycle.endsOn).toBe('2026-10-24');
    expect(cycle.daysLeft).toBe(2);
    expect(DeadlineItem.safeParse({ ...milestoneDeadline, kind: 'cycle' }).success).toBe(false);
    expect(DeadlineItem.safeParse({ ...cycleDeadline, kind: 'sprint' }).success).toBe(false);
    expect(
      DeadlineItem.safeParse({
        ...milestoneDeadline,
        milestone: { ...milestoneDeadline.milestone, targetDate: null },
      }).success,
    ).toBe(false);
    expect(DeadlineItem.safeParse({ ...milestoneDeadline, daysOverdue: 0 }).success).toBe(false);
    expect(DeadlineItem.safeParse({ ...cycleDeadline, daysLeft: 0 }).success).toBe(false);
  });

  it('caps group items and keeps total at least the item count', () => {
    const items = Array.from({ length: DASHBOARD_GROUP_ITEM_LIMIT }, () => reviewItem);
    const capped = { ...fullDashboard, groups: { ...fullDashboard.groups, review: { total: 132, items } } };
    expect(Dashboard.parse(capped).groups.review.total).toBe(132);
    const over = {
      ...capped,
      groups: { ...capped.groups, review: { total: 132, items: [...items, reviewItem] } },
    };
    expect(Dashboard.safeParse(over).success).toBe(false);
    const short = {
      ...fullDashboard,
      groups: { ...fullDashboard.groups, deadlines: { total: 1, items: [milestoneDeadline, cycleDeadline] } },
    };
    expect(Dashboard.safeParse(short).success).toBe(false);
  });

  it('rejects an unknown scope and a missing group', () => {
    expect(Dashboard.safeParse({ ...emptyDashboard, scope: 'team' }).success).toBe(false);
    const { stalled: _stalled, ...threeGroups } = emptyDashboard.groups;
    expect(Dashboard.safeParse({ ...emptyDashboard, groups: threeGroups }).success).toBe(false);
  });

  it('requires the responsible field on assignees and agents', () => {
    expect(ReviewItem.safeParse({ ...reviewItem, assignee: claudeDev }).success).toBe(false);
    expect(DashboardAgent.safeParse({ ...busyAgent, agent: claudeDev }).success).toBe(false);
  });

  it('checks that the counts add up', () => {
    expect(DashboardCounts.parse({ review: 0, mentions: 0, stalled: 0, deadlines: 0, total: 0 }).total).toBe(
      0,
    );
    expect(
      DashboardCounts.safeParse({ review: 3, mentions: 1, stalled: 1, deadlines: 2, total: 6 }).success,
    ).toBe(false);
    expect(
      DashboardCounts.safeParse({ review: -1, mentions: 1, stalled: 0, deadlines: 0, total: 0 }).success,
    ).toBe(false);
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
