import { describe, expect, it } from 'vitest';
import {
  CLI_RESULT_NAMES,
  cliOutput,
  cliOutputSchemas,
  cliSchemaId,
  ProjectFile,
  parseCliOutput,
} from './cli';
import { problem } from './problem';
import {
  activityFixture,
  commentFixture,
  completedCycleFixture,
  cycleFixture,
  deletedCommentFixture,
  meFixture,
  milestoneWithProgressFixture,
  projectWithCountsFixture,
  taskFixture,
  taskListPageFixture,
  timelineFixture,
} from './testing/fixtures';

describe('CLI output', () => {
  it('names schemas pm.v1.<name>', () => {
    expect(cliSchemaId('tasks.list')).toBe('pm.v1.tasks.list');
    expect(CLI_RESULT_NAMES).toEqual([
      'login',
      'logout',
      'whoami',
      'projects.list',
      'tasks.list',
      'tasks.show',
      'tasks.create',
      'tasks.update',
      'comments.list',
      'comments.add',
      'comments.edit',
      'comments.delete',
      'milestones.list',
      'milestones.create',
      'milestones.update',
      'cycles.list',
      'cycles.create',
      'cycles.current',
      'cycles.end',
      'link',
      'agents',
      'dashboard',
      'error',
    ]);
  });

  it('describes the M2.1 results: whoami project, link and agents', () => {
    const me = cliOutputSchemas.whoami.shape.data;
    expect(
      me.safeParse({ ...meFixture, project: { key: 'PAY', source: 'remote', from: 'git@x.io:t/p.git' } })
        .success,
    ).toBe(true);
    expect(me.safeParse({ ...meFixture, project: null }).success).toBe(true);
    expect(me.safeParse(meFixture).success, 'older pm without the field').toBe(true);
    expect(me.safeParse({ ...meFixture, project: { key: 'PAY', source: 'guess', from: null } }).success).toBe(
      false,
    );

    const link = cliOutput('link', {
      project: 'PAY',
      target: 'server',
      action: 'linked',
      repository: 'gitlab.com/t/p',
      file: null,
    });
    expect(link.schema).toBe('pm.v1.link');
    const agents = cliOutput('agents', {
      file: '/repo/AGENTS.md',
      action: 'created',
      project: null,
      block: '...',
    });
    expect(agents.data.action).toBe('created');
    expect(ProjectFile.safeParse({ project: 'pay' }).data).toEqual({ project: 'PAY' });
    expect(ProjectFile.safeParse({ project: 'PAY', url: 'https://pm.example.com' }).success).toBe(false);
  });

  it('wraps data in the versioned envelope and serialises dates', () => {
    const out = cliOutput('tasks.create', taskFixture);
    expect(out.schema).toBe('pm.v1.tasks.create');
    expect(out.data.key).toBe('PAY-142');
    expect(out.data.createdAt).toBe('2026-10-20T09:00:00.000Z');
  });

  it('refuses to print data the contract does not describe', () => {
    expect(() => cliOutput('tasks.update', { ...taskFixture, status: 'started' } as never)).toThrow();
  });

  it.each([
    ['login', { url: 'https://pm.example.com', me: meFixture }],
    ['logout', { url: null }],
    ['whoami', meFixture],
    ['projects.list', { items: [projectWithCountsFixture] }],
    ['tasks.list', taskListPageFixture],
    ['tasks.show', { task: taskFixture, activity: [activityFixture] }],
    ['tasks.show', { task: taskFixture, activity: [activityFixture], timeline: timelineFixture }],
    ['tasks.create', taskFixture],
    ['tasks.update', taskFixture],
    ['comments.list', { items: [commentFixture, deletedCommentFixture] }],
    ['comments.add', commentFixture],
    ['comments.edit', commentFixture],
    ['comments.delete', deletedCommentFixture],
    ['milestones.list', { items: [milestoneWithProgressFixture] }],
    ['milestones.create', milestoneWithProgressFixture],
    ['milestones.update', milestoneWithProgressFixture],
    ['cycles.list', { items: [cycleFixture, completedCycleFixture] }],
    ['cycles.create', cycleFixture],
    ['cycles.current', cycleFixture],
    ['cycles.current', null],
    ['cycles.end', completedCycleFixture],
    [
      'dashboard',
      {
        scope: 'mine',
        generatedAt: new Date('2026-10-23T09:00:00.000Z'),
        groups: {
          review: { total: 0, items: [] },
          mentions: { total: 0, items: [] },
          stalled: { total: 0, items: [] },
          deadlines: { total: 0, items: [] },
        },
        projects: [],
        agents: [],
      },
    ],
    ['error', problem('FORBIDDEN', 'This key is read-only')],
  ] as const)('%s round-trips through JSON', (name, data) => {
    const printed = JSON.stringify(cliOutput(name, data as never));
    const parsed = parseCliOutput(JSON.parse(printed), name);
    expect(parsed).toEqual(JSON.parse(printed));
    expect(parseCliOutput(JSON.parse(printed)).schema).toBe(`pm.v1.${name}`);
  });

  it('rejects unknown versions and mismatched names', () => {
    const v2 = { schema: 'pm.v2.whoami', data: cliOutput('whoami', meFixture).data };
    expect(() => parseCliOutput(v2)).toThrow();
    expect(() => parseCliOutput(cliOutput('whoami', meFixture), 'tasks.show')).toThrow();
  });
});
