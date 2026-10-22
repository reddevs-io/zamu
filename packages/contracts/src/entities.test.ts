import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cliDataSchemas } from './cli';
import {
  Activity,
  ActivityList,
  ApiKeyCreated,
  ApiKeyMetadata,
  ApiKeySummary,
  Invitation,
  Me,
  Member,
  MemberList,
  Project,
  ProjectList,
  ProjectWithCounts,
  Task,
  TaskListItem,
  TaskListPage,
} from './entities';
import * as inputs from './inputs';
import { Problem, problem } from './problem';
import {
  activityFixture,
  apiKeyCreatedFixture,
  apiKeySummaryFixture,
  invitationFixture,
  meFixture,
  memberFixture,
  projectFixture,
  projectId,
  projectWithCountsFixture,
  taskFixture,
  taskListItemFixture,
  taskListPageFixture,
} from './testing/fixtures';

const cases: [string, z.ZodType, unknown][] = [
  ['Project', Project, projectFixture],
  ['ProjectWithCounts', ProjectWithCounts, projectWithCountsFixture],
  ['ProjectList', ProjectList, { items: [projectWithCountsFixture] }],
  ['Task', Task, taskFixture],
  ['TaskListItem', TaskListItem, taskListItemFixture],
  ['TaskListPage', TaskListPage, taskListPageFixture],
  ['Activity', Activity, activityFixture],
  ['ActivityList', ActivityList, { items: [activityFixture] }],
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
