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
  Invitation,
  Me,
  Member,
  MemberList,
  Milestone,
  MilestoneList,
  MilestoneWithProgress,
  milestoneProgressRatio,
  Project,
  ProjectList,
  ProjectWithCounts,
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
