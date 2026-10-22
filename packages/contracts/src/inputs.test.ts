import { describe, expect, it } from 'vitest';
import {
  CreateAgentInput,
  CreateApiKeyInput,
  CreateInvitationInput,
  CreateProjectInput,
  CreateTaskInput,
  DEFAULT_TASK_LIST_LIMIT,
  GetTaskInput,
  ListTasksInput,
  RevokeApiKeyInput,
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
    expect(result.error?.issues[0]?.message).toBe('Change at least one of key, name or description');
  });
});

describe('ListTasksInput', () => {
  it('defaults the limit', () => {
    expect(ListTasksInput.parse({ project: 'PAY' })).toEqual({
      project: 'PAY',
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

  it('requires the project', () => {
    expect(ListTasksInput.safeParse({}).success).toBe(false);
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
  ])('rejects %j', (input) => {
    expect(CreateTaskInput.safeParse(input).success).toBe(false);
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
