import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_LENGTH } from './entities';
import {
  CreateAgentInput,
  CreateApiKeyInput,
  CreateCommentInput,
  CreateCycleInput,
  CreateInvitationInput,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  DEFAULT_TASK_LIST_LIMIT,
  DeleteCommentInput,
  DeleteMilestoneInput,
  EndCycleInput,
  GetCycleInput,
  GetMilestoneInput,
  GetTaskInput,
  ListCommentsInput,
  ListCyclesInput,
  ListMilestonesInput,
  ListTasksInput,
  ListTaskTimelineInput,
  RevokeApiKeyInput,
  UpdateCommentInput,
  UpdateCycleInput,
  UpdateMeInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './inputs';
import { projectId } from './testing/fixtures';

describe('CreateProjectInput', () => {
  it('normalises the key and trims the name', () => {
    expect(CreateProjectInput.parse({ name: '  Payments ', key: 'pay' })).toEqual({
      name: 'Payments',
      key: 'PAY',
    });
  });

  it('keeps an optional description', () => {
    expect(CreateProjectInput.parse({ name: 'Web', key: 'WEB', description: 'Dashboard' }).description).toBe(
      'Dashboard',
    );
  });

  it.each([
    [{ name: '', key: 'PAY' }],
    [{ name: '   ', key: 'PAY' }],
    [{ name: 'Payments', key: 'P' }],
    [{ name: 'Payments' }],
    [{ name: 'x'.repeat(101), key: 'PAY' }],
  ])('rejects %j', (input) => {
    expect(CreateProjectInput.safeParse(input).success).toBe(false);
  });
});

describe('UpdateProjectInput', () => {
  it('takes the current key and the changes', () => {
    expect(UpdateProjectInput.parse({ project: 'pay', key: 'pays', description: null })).toEqual({
      project: 'PAY',
      key: 'PAYS',
      description: null,
    });
  });

  it('requires at least one change', () => {
    const result = UpdateProjectInput.safeParse({ project: 'PAY' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Change at least one of key, name, description, usesMilestones or usesCycles',
    );
  });

  it('turns milestones and cycles on or off', () => {
    expect(UpdateProjectInput.parse({ project: 'PAY', usesCycles: false })).toEqual({
      project: 'PAY',
      usesCycles: false,
    });
    expect(UpdateProjectInput.parse({ project: 'PAY', usesMilestones: true }).usesMilestones).toBe(true);
    expect(UpdateProjectInput.safeParse({ project: 'PAY', usesCycles: 'no' }).success).toBe(false);
  });
});

describe('ListTasksInput', () => {
  it('defaults the limit', () => {
    expect(ListTasksInput.parse({ project: 'PAY' })).toEqual({
      project: ['PAY'],
      order: 'list',
      limit: DEFAULT_TASK_LIST_LIMIT,
    });
    expect(DEFAULT_TASK_LIST_LIMIT).toBe(50);
  });

  it('coerces a numeric limit from a query string', () => {
    expect(ListTasksInput.parse({ project: 'PAY', limit: '10' }).limit).toBe(10);
  });

  it.each([0, 201, 1.5, 'ten', ''])('rejects limit %j', (limit) => {
    expect(ListTasksInput.safeParse({ project: 'PAY', limit }).success).toBe(false);
  });

  it('accepts one status or several, and de-duplicates', () => {
    expect(ListTasksInput.parse({ project: 'PAY', status: 'todo' }).status).toEqual(['todo']);
    expect(ListTasksInput.parse({ project: 'PAY', status: ['todo', 'done', 'todo'] }).status).toEqual([
      'todo',
      'done',
    ]);
    expect(ListTasksInput.parse({ project: 'PAY', priority: 'urgent' }).priority).toEqual(['urgent']);
  });

  it('rejects an empty or unknown status list', () => {
    expect(ListTasksInput.safeParse({ project: 'PAY', status: [] }).success).toBe(false);
    expect(ListTasksInput.safeParse({ project: 'PAY', status: ['started'] }).success).toBe(false);
    expect(ListTasksInput.safeParse({ project: 'PAY', priority: [5] }).success).toBe(false);
  });

  it.each(['me', 'agents', '0190a1b2-0000-7000-8000-00000000a0a0'])(
    'accepts assignee filter %s',
    (assignee) => {
      expect(ListTasksInput.parse({ project: 'PAY', assignee }).assignee).toBe(assignee);
    },
  );

  it('rejects an assignee that is neither me, agents nor a user id, and an over-long query', () => {
    expect(ListTasksInput.safeParse({ project: 'PAY', assignee: '' }).success).toBe(false);
    expect(ListTasksInput.safeParse({ project: 'PAY', assignee: 'ana' }).success).toBe(false);
    expect(ListTasksInput.safeParse({ project: 'PAY', q: 'x'.repeat(201) }).success).toBe(false);
  });

  it('trims the query and keeps the cursor', () => {
    expect(ListTasksInput.parse({ project: 'PAY', q: ' webhook ', cursor: 'abc' })).toMatchObject({
      q: 'webhook',
      cursor: 'abc',
    });
  });

  it('takes no project, one key or several, normalised and de-duplicated', () => {
    expect(ListTasksInput.parse({})).toEqual({ order: 'list', limit: DEFAULT_TASK_LIST_LIMIT });
    expect(ListTasksInput.parse({ project: ['pay', 'WEB', 'PAY'] }).project).toEqual(['PAY', 'WEB']);
    expect(ListTasksInput.safeParse({ project: [] }).success).toBe(false);
    expect(ListTasksInput.safeParse({ project: 'P' }).success).toBe(false);
  });

  it('filters by milestone id or none', () => {
    expect(ListTasksInput.parse({ milestone: 'none' }).milestone).toBe('none');
    expect(ListTasksInput.parse({ milestone: projectId }).milestone).toBe(projectId);
    expect(ListTasksInput.safeParse({ milestone: 'Webhooks v2' }).success).toBe(false);
  });

  it.each([
    ['current', 'current'],
    ['next', 'next'],
    ['none', 'none'],
    ['12', 12],
    [12, 12],
  ])('filters by cycle %j', (cycle, parsed) => {
    expect(ListTasksInput.parse({ cycle }).cycle).toBe(parsed);
  });

  it.each(['0', '-1', '1.5', 'C12', 'previous', '', 0, 2.5, 99_999_999_999])(
    'rejects cycle filter %j',
    (cycle) => {
      const result = ListTasksInput.safeParse({ cycle });
      expect(result.success).toBe(false);
    },
  );

  it('explains a bad cycle filter', () => {
    const result = ListTasksInput.safeParse({ cycle: 'previous' });
    expect(result.error?.issues[0]?.message).toBe('Use a cycle number, current, next or none');
  });

  it('orders by list or board', () => {
    expect(ListTasksInput.parse({ order: 'board' }).order).toBe('board');
    expect(ListTasksInput.safeParse({ order: 'rank' }).success).toBe(false);
  });
});

describe('GetTaskInput', () => {
  it('normalises the key', () => {
    expect(GetTaskInput.parse({ key: 'pay-142' })).toEqual({ key: 'PAY-142' });
    expect(GetTaskInput.safeParse({ key: 'PAY-0' }).success).toBe(false);
  });
});

describe('CreateTaskInput', () => {
  it('defaults status to todo and priority to none', () => {
    expect(CreateTaskInput.parse({ project: 'pay', title: ' Fix rounding ' })).toEqual({
      project: 'PAY',
      title: 'Fix rounding',
      status: 'todo',
      priority: 'none',
    });
  });

  it('keeps explicit values, the assignee and the Markdown description untrimmed', () => {
    expect(
      CreateTaskInput.parse({
        project: 'PAY',
        title: 'x',
        description: '  - [ ] item\n',
        status: 'backlog',
        priority: 'urgent',
        assignee: 'me',
      }),
    ).toEqual({
      project: 'PAY',
      title: 'x',
      description: '  - [ ] item\n',
      status: 'backlog',
      priority: 'urgent',
      assignee: 'me',
    });
  });

  it.each([
    [{ project: 'PAY', title: '' }],
    [{ project: 'PAY', title: '   ' }],
    [{ project: 'PAY', title: 'x'.repeat(301) }],
    [{ project: 'PAY', title: 'x', status: 'started' }],
    [{ project: 'PAY', title: 'x', priority: 2 }],
    [{ project: 'PAY', title: 'x', assignee: 'ana' }],
    [{ title: 'x' }],
    [{ project: 'PAY', title: 'x', milestone: 'Webhooks v2' }],
    [{ project: 'PAY', title: 'x', cycle: 'none' }],
    [{ project: 'PAY', title: 'x', cycle: 0 }],
    [{ project: 'PAY', title: 'x', cycle: 'last' }],
  ])('rejects %j', (input) => {
    expect(CreateTaskInput.safeParse(input).success).toBe(false);
  });

  it('takes a milestone id and a cycle selector', () => {
    expect(
      CreateTaskInput.parse({ project: 'PAY', title: 'x', milestone: projectId, cycle: 'next' }),
    ).toMatchObject({
      milestone: projectId,
      cycle: 'next',
    });
    expect(CreateTaskInput.parse({ project: 'PAY', title: 'x', cycle: '13' }).cycle).toBe(13);
    expect(CreateTaskInput.parse({ project: 'PAY', title: 'x', milestone: null, cycle: null })).toMatchObject(
      {
        milestone: null,
        cycle: null,
      },
    );
  });
});

describe('UpdateTaskInput', () => {
  it('passes only the fields given', () => {
    expect(UpdateTaskInput.parse({ key: 'pay-1', status: 'done' })).toEqual({ key: 'PAY-1', status: 'done' });
  });

  it('null clears the assignee and the description', () => {
    expect(UpdateTaskInput.parse({ key: 'PAY-1', assignee: null, description: null })).toEqual({
      key: 'PAY-1',
      assignee: null,
      description: null,
    });
  });

  it('requires at least one change', () => {
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1' }).success).toBe(false);
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1', title: undefined }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1', title: ' ' }).success).toBe(false);
  });

  it('does not apply create defaults', () => {
    expect(UpdateTaskInput.parse({ key: 'PAY-1', title: 'New' })).not.toHaveProperty('status');
  });

  it('sets or clears the milestone and the cycle', () => {
    expect(UpdateTaskInput.parse({ key: 'PAY-1', milestone: null, cycle: 'current' })).toEqual({
      key: 'PAY-1',
      milestone: null,
      cycle: 'current',
    });
    expect(UpdateTaskInput.parse({ key: 'PAY-1', cycle: null }).cycle).toBeNull();
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1', cycle: 'none' }).success).toBe(false);
  });

  it('moves a card with a position and the last seen updatedAt', () => {
    expect(
      UpdateTaskInput.parse({
        key: 'PAY-140',
        status: 'in_review',
        position: { before: 'pay-131' },
        ifUpdatedAt: '2026-10-22T20:00:00.123+02:00',
      }),
    ).toEqual({
      key: 'PAY-140',
      status: 'in_review',
      position: { before: 'PAY-131' },
      ifUpdatedAt: '2026-10-22T18:00:00.123Z',
    });
    expect(UpdateTaskInput.parse({ key: 'PAY-140', position: { after: 'PAY-9' } }).position).toEqual({
      after: 'PAY-9',
    });
  });

  it.each([
    [{ before: 'PAY-1', after: 'PAY-2' }],
    [{}],
    [{ before: 'nope' }],
    [{ above: 'PAY-1' }],
    ['PAY-1'],
  ])('rejects position %j', (position) => {
    const result = UpdateTaskInput.safeParse({ key: 'PAY-140', position });
    expect(result.success).toBe(false);
  });

  it('explains a position with both before and after', () => {
    const result = UpdateTaskInput.safeParse({
      key: 'PAY-140',
      position: { before: 'PAY-1', after: 'PAY-2' },
    });
    expect(result.error?.issues[0]?.message).toBe('Give exactly one of before or after');
  });

  it('needs a change besides ifUpdatedAt, and a valid timestamp', () => {
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1', ifUpdatedAt: '2026-10-22T18:00:00Z' }).success).toBe(
      false,
    );
    expect(UpdateTaskInput.safeParse({ key: 'PAY-1', title: 'x', ifUpdatedAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('UpdateMeInput', () => {
  it.each(['system', 'light', 'dark'])('accepts theme %s', (theme) => {
    expect(UpdateMeInput.parse({ theme })).toEqual({ theme });
  });

  it.each([{}, { theme: 'sepia' }, { theme: 'Dark' }])('rejects %j', (input) => {
    expect(UpdateMeInput.safeParse(input).success).toBe(false);
  });
});

describe('comment inputs', () => {
  it('trims the body and normalises the task key', () => {
    expect(CreateCommentInput.parse({ key: 'pay-1', body: '  Done. @claude-dev \n' })).toEqual({
      key: 'PAY-1',
      body: 'Done. @claude-dev',
    });
  });

  it('takes a body of exactly 20,000 characters after trimming', () => {
    expect(
      CreateCommentInput.parse({ key: 'PAY-1', body: ` ${'x'.repeat(MAX_COMMENT_LENGTH)} ` }).body,
    ).toHaveLength(MAX_COMMENT_LENGTH);
  });

  it.each([
    ['empty', ''],
    ['only spaces', ' \n\t '],
    ['too long', 'x'.repeat(MAX_COMMENT_LENGTH + 1)],
  ])('rejects a body that is %s', (_label, body) => {
    expect(CreateCommentInput.safeParse({ key: 'PAY-1', body }).success).toBe(false);
    expect(UpdateCommentInput.safeParse({ id: projectId, body }).success).toBe(false);
  });

  it('edits, lists and deletes by id or key', () => {
    expect(UpdateCommentInput.parse({ id: projectId, body: 'New' })).toEqual({ id: projectId, body: 'New' });
    expect(DeleteCommentInput.parse({ id: projectId })).toEqual({ id: projectId });
    expect(DeleteCommentInput.safeParse({ id: 'c-1' }).success).toBe(false);
    expect(ListCommentsInput.parse({ key: 'pay-7' })).toEqual({ key: 'PAY-7' });
    expect(ListTaskTimelineInput.parse({ key: 'pay-7' })).toEqual({ key: 'PAY-7' });
    expect(CreateCommentInput.safeParse({ key: 'PAY', body: 'x' }).success).toBe(false);
  });
});

describe('milestone inputs', () => {
  it('creates with a trimmed name and optional description and target date', () => {
    expect(
      CreateMilestoneInput.parse({ project: 'pay', name: ' Webhooks v2 ', targetDate: '2026-11-14' }),
    ).toEqual({
      project: 'PAY',
      name: 'Webhooks v2',
      targetDate: '2026-11-14',
    });
  });

  it.each([
    [{ project: 'PAY', name: '' }],
    [{ project: 'PAY', name: 'x'.repeat(101) }],
    [{ project: 'PAY', name: 'x', targetDate: '2026-11-31' }],
    [{ project: 'PAY', name: 'x', targetDate: '14/11/2026' }],
    [{ project: 'PAY', name: 'x', targetDate: '2026-11-14T00:00:00Z' }],
    [{ name: 'x' }],
  ])('rejects create %j', (input) => {
    expect(CreateMilestoneInput.safeParse(input).success).toBe(false);
  });

  it('updates fields, clears with null and requires a change', () => {
    expect(UpdateMilestoneInput.parse({ id: projectId, targetDate: null, status: 'completed' })).toEqual({
      id: projectId,
      targetDate: null,
      status: 'completed',
    });
    expect(UpdateMilestoneInput.safeParse({ id: projectId }).success).toBe(false);
    expect(UpdateMilestoneInput.safeParse({ id: projectId, status: 'done' }).success).toBe(false);
  });

  it('lists by project with an optional status filter', () => {
    expect(ListMilestonesInput.parse({ project: 'pay', status: 'active' })).toEqual({
      project: 'PAY',
      status: ['active'],
    });
    expect(GetMilestoneInput.safeParse({ id: 'Webhooks v2' }).success).toBe(false);
    expect(DeleteMilestoneInput.parse({ id: projectId })).toEqual({ id: projectId });
  });
});

describe('cycle inputs', () => {
  it('creates with defaults left to core', () => {
    expect(CreateCycleInput.parse({ project: 'pay' })).toEqual({ project: 'PAY' });
    expect(
      CreateCycleInput.parse({
        project: 'PAY',
        name: ' Checkout ',
        startsOn: '2026-10-26',
        endsOn: '2026-11-08',
      }),
    ).toEqual({ project: 'PAY', name: 'Checkout', startsOn: '2026-10-26', endsOn: '2026-11-08' });
  });

  it('accepts one-day and 56-day cycles', () => {
    expect(
      CreateCycleInput.safeParse({ project: 'PAY', startsOn: '2026-10-26', endsOn: '2026-10-26' }).success,
    ).toBe(true);
    expect(
      CreateCycleInput.safeParse({ project: 'PAY', startsOn: '2026-11-09', endsOn: '2027-01-03' }).success,
    ).toBe(true);
  });

  it.each([
    [
      'ends before it starts',
      { startsOn: '2026-10-26', endsOn: '2026-10-25' },
      'End on or after the start date',
    ],
    ['lasts 57 days', { startsOn: '2026-11-09', endsOn: '2027-01-04' }, 'Keep cycles to 56 days or fewer'],
  ])('rejects a cycle that %s', (_label, dates, message) => {
    const result = CreateCycleInput.safeParse({ project: 'PAY', ...dates });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['endsOn'], message });
    expect(UpdateCycleInput.safeParse({ project: 'PAY', number: 3, ...dates }).success).toBe(false);
  });

  it('addresses a cycle by number, current or next', () => {
    expect(GetCycleInput.parse({ project: 'pay', number: '12' })).toEqual({ project: 'PAY', number: 12 });
    expect(GetCycleInput.parse({ project: 'PAY', number: 'current' }).number).toBe('current');
    expect(GetCycleInput.safeParse({ project: 'PAY', number: 'none' }).success).toBe(false);
  });

  it('updates the name or dates and requires a change', () => {
    expect(UpdateCycleInput.parse({ project: 'PAY', number: 12, name: null })).toEqual({
      project: 'PAY',
      number: 12,
      name: null,
    });
    expect(UpdateCycleInput.safeParse({ project: 'PAY', number: 12 }).success).toBe(false);
  });

  it('ends with an optional target: a number or none', () => {
    expect(EndCycleInput.parse({ project: 'PAY', number: 'current' })).toEqual({
      project: 'PAY',
      number: 'current',
    });
    expect(EndCycleInput.parse({ project: 'PAY', number: 12, moveTo: '13' }).moveTo).toBe(13);
    expect(EndCycleInput.parse({ project: 'PAY', number: 12, moveTo: 'none' }).moveTo).toBe('none');
    expect(EndCycleInput.safeParse({ project: 'PAY', number: 12, moveTo: 'next' }).success).toBe(false);
    expect(EndCycleInput.safeParse({ project: 'PAY', number: 12, moveTo: 0 }).success).toBe(false);
  });

  it('lists by project with an optional state filter', () => {
    expect(ListCyclesInput.parse({ project: 'PAY', state: ['current', 'upcoming'] })).toEqual({
      project: 'PAY',
      state: ['current', 'upcoming'],
    });
    expect(ListCyclesInput.safeParse({ project: 'PAY', state: 'active' }).success).toBe(false);
  });
});

describe('settings inputs', () => {
  it('accepts an agent with a workspace-wide read-write key', () => {
    expect(
      CreateAgentInput.parse({
        name: 'docs-bot',
        responsibleUserId: '0190a1b2-0000-7000-8000-00000000a0a0',
        scope: { projects: 'all', access: 'write' },
      }),
    ).toEqual({
      name: 'docs-bot',
      responsibleUserId: '0190a1b2-0000-7000-8000-00000000a0a0',
      scope: { projects: 'all', access: 'write' },
    });
  });

  it.each(['Docs-Bot', 'docs bot', '-docs', 'docs-', 'docs--bot', 'd', 'x'.repeat(65)])(
    'rejects agent name %s',
    (name) => {
      expect(
        CreateAgentInput.safeParse({
          name,
          responsibleUserId: '0190a1b2-0000-7000-8000-00000000a0a0',
          scope: { projects: 'all', access: 'read' },
        }).success,
      ).toBe(false);
    },
  );

  it('scopes a key to selected projects, never to none', () => {
    const base = { name: 'CI runner', scope: { access: 'read' } };
    expect(
      CreateApiKeyInput.parse({ ...base, scope: { ...base.scope, projects: [projectId] } }).scope,
    ).toEqual({
      projects: [projectId],
      access: 'read',
    });
    expect(CreateApiKeyInput.safeParse({ ...base, scope: { ...base.scope, projects: [] } }).success).toBe(
      false,
    );
    expect(
      CreateApiKeyInput.safeParse({ ...base, scope: { ...base.scope, projects: ['PAY'] } }).success,
    ).toBe(false);
    expect(
      CreateApiKeyInput.safeParse({ name: 'x', scope: { projects: 'all', access: 'admin' } }).success,
    ).toBe(false);
  });

  it('revokes by id', () => {
    expect(RevokeApiKeyInput.parse({ id: '0190a1b2-0000-7000-8000-00000000e0e0' })).toEqual({
      id: '0190a1b2-0000-7000-8000-00000000e0e0',
    });
    expect(RevokeApiKeyInput.safeParse({ id: '' }).success).toBe(false);
  });

  it('defaults invitations to the member role', () => {
    expect(CreateInvitationInput.parse({ email: 'jo@example.com' })).toEqual({
      email: 'jo@example.com',
      role: 'member',
    });
    expect(CreateInvitationInput.safeParse({ email: 'jo' }).success).toBe(false);
    expect(CreateInvitationInput.safeParse({ email: 'jo@example.com', role: 'owner' }).success).toBe(false);
  });
});
