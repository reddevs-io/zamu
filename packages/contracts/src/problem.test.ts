import { ORPCError, ValidationError } from '@orpc/contract';
import { describe, expect, it } from 'vitest';
import { CreateTaskInput } from './inputs';
import {
  isMirroredProblemCode,
  PROBLEM_CODES,
  PROBLEM_STATUS,
  Problem,
  ProblemData,
  problem,
  problemJsonSchema,
  toProblemIssues,
} from './problem';
import { decodeProblem, encodeProblem } from './problem-codec';
import { taskFixture } from './testing/fixtures';

describe('problem()', () => {
  it('fills title and status from the code', () => {
    expect(problem('NOT_FOUND', 'No task PAY-9', { requestId: 'req_1' })).toEqual({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'No task PAY-9',
      requestId: 'req_1',
    });
  });

  it('builds a valid Problem for every code', () => {
    for (const code of PROBLEM_CODES) {
      const body = problem(code);
      expect(Problem.parse(body)).toEqual(body);
      expect(body.status).toBe(PROBLEM_STATUS[code]);
    }
  });

  it('answers 409 for every Backlog.md code, with a title', () => {
    for (const code of [
      'TASK_MIRRORED',
      'MILESTONE_MIRRORED',
      'PROJECT_MIRRORED',
      'PROJECT_NOT_EMPTY',
      'BACKLOG_PAUSED',
      'BACKLOG_DETACHED',
    ] as const) {
      expect(PROBLEM_CODES).toContain(code);
      expect(problem(code)).toMatchObject({ status: 409, code, title: expect.any(String) });
    }
    expect(isMirroredProblemCode('TASK_MIRRORED')).toBe(true);
    expect(isMirroredProblemCode('PROJECT_NOT_EMPTY')).toBe(false);
  });

  it('carries the mirror extensions: field, file, backlogId and hint', () => {
    const body = problem('TASK_MIRRORED', 'status comes from Backlog.md', {
      requestId: 'req_9',
      field: 'status',
      file: 'backlog/tasks/back-786 - Retry.md',
      backlogId: 'BACK-786',
      hint: 'backlog task edit 786 -s "In Progress"',
    });
    expect(Problem.parse(JSON.parse(JSON.stringify(body)))).toEqual(body);
    expect(body).toMatchObject({
      title: 'Field comes from Backlog.md',
      field: 'status',
      backlogId: 'BACK-786',
    });
    expect(ProblemData.parse({ field: 'status', file: 'f.md', backlogId: 'BACK-1', hint: 'h' })).toEqual({
      field: 'status',
      file: 'f.md',
      backlogId: 'BACK-1',
      hint: 'h',
    });
    expect(Problem.safeParse({ ...body, field: 3 }).success).toBe(false);
  });

  it('defaults type when parsing a minimal body', () => {
    expect(Problem.parse({ title: 'Conflict', status: 409, code: 'CONFLICT' }).type).toBe('about:blank');
  });
});

describe('toProblemIssues', () => {
  it('turns Zod issues into dotted paths', () => {
    const result = CreateTaskInput.safeParse({ project: '1', title: '' });
    expect(toProblemIssues(result.error?.issues ?? [])).toEqual([
      { path: 'project', message: 'Use 2 to 6 letters or digits, starting with a letter' },
      { path: 'title', message: 'Title is required' },
    ]);
  });

  it('handles path segment objects and empty paths', () => {
    expect(
      toProblemIssues([{ path: [{ key: 'scope' }, 'projects', 0], message: 'x' }, { message: 'y' }]),
    ).toEqual([
      { path: 'scope.projects.0', message: 'x' },
      { path: '', message: 'y' },
    ]);
  });
});

describe('encodeProblem / decodeProblem', () => {
  it('encodes a contract error with its data', () => {
    const error = new ORPCError('FORBIDDEN', {
      message: 'This key is read-only',
      data: { requestId: 'req_2' },
    });
    expect(encodeProblem(error)).toEqual({
      type: 'about:blank',
      title: 'Not allowed',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'This key is read-only',
      requestId: 'req_2',
    });
  });

  it('lists validation issues from oRPC input validation', () => {
    const issues = CreateTaskInput.safeParse({ project: 'PAY', title: '' }).error?.issues ?? [];
    const error = new ORPCError('BAD_REQUEST', {
      message: 'Input validation failed',
      cause: new ValidationError({ message: 'Input validation failed', issues }),
    });
    expect(encodeProblem(error, 'req_3')).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      requestId: 'req_3',
      issues: [{ path: 'title', message: 'Title is required' }],
    });
  });

  it('falls back by status class for codes outside the contract', () => {
    expect(encodeProblem(new ORPCError('TOO_MANY_REQUESTS'))).toMatchObject({
      code: 'BAD_REQUEST',
      status: 429,
    });
    expect(encodeProblem(new ORPCError('BAD_GATEWAY'))).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 502,
    });
  });

  it('decodes a Problem back into a defined ORPCError', () => {
    const decoded = decodeProblem(
      problem('UNPROCESSABLE_CONTENT', 'Assignee is not a member', {
        requestId: 'req_4',
        issues: [{ path: 'assignee', message: 'Not a member' }],
      }),
    );
    expect(decoded).toBeInstanceOf(ORPCError);
    expect(decoded?.defined).toBe(true);
    expect(decoded?.code).toBe('UNPROCESSABLE_CONTENT');
    expect(decoded?.status).toBe(422);
    expect(decoded?.message).toBe('Assignee is not a member');
    expect(decoded?.data).toEqual({
      requestId: 'req_4',
      issues: [{ path: 'assignee', message: 'Not a member' }],
    });
  });

  it('round-trips encode then decode', () => {
    const original = new ORPCError('NOT_FOUND', { message: 'No task PAY-9' });
    const decoded = decodeProblem(JSON.parse(JSON.stringify(encodeProblem(original))));
    expect(decoded?.code).toBe('NOT_FOUND');
    expect(decoded?.message).toBe('No task PAY-9');
  });

  it('carries the current task through a TASK_CHANGED conflict', () => {
    const error = new ORPCError('TASK_CHANGED', {
      status: 409,
      message: 'PAY-142 changed since you loaded it',
      data: { requestId: 'req_5', task: taskFixture },
    });
    const body = encodeProblem(error);
    expect(body).toMatchObject({
      title: 'Task changed',
      status: 409,
      code: 'TASK_CHANGED',
      requestId: 'req_5',
      task: { key: 'PAY-142', updatedAt: '2026-10-22T18:00:00.000Z' },
    });
    const decoded = decodeProblem(JSON.parse(JSON.stringify(body)));
    expect(decoded?.code).toBe('TASK_CHANGED');
    expect(decoded?.status).toBe(409);
    expect(decoded?.data.task?.key).toBe('PAY-142');
    expect(decoded?.data.task?.rank).toBe(taskFixture.rank);
  });

  it('rejects a Problem whose task is not a task', () => {
    expect(Problem.safeParse({ ...problem('TASK_CHANGED'), task: { key: 'PAY-1' } }).success).toBe(false);
  });

  it('returns null for bodies that are not Problems', () => {
    expect(decodeProblem({ defined: false, code: 'NOT_FOUND', status: 404, message: 'x' })).toBeNull();
    expect(decodeProblem('oops')).toBeNull();
    expect(decodeProblem(null)).toBeNull();
  });
});

describe('mirrored problem extensions', () => {
  it('round-trips field, file, backlogId and hint through encode and decode', () => {
    const data = {
      field: 'status',
      file: 'backlog/tasks/back-786 - Add webhooks.md',
      backlogId: 'BACK-786',
      hint: 'backlog task edit 786 -s Done',
    };
    const body = encodeProblem(
      new ORPCError('TASK_MIRRORED', { status: 409, message: 'Status comes from Backlog.md', data }),
    );
    expect(body).toMatchObject({ code: 'TASK_MIRRORED', status: 409, ...data });
    const decoded = decodeProblem(body);
    expect(decoded?.data).toMatchObject(data);
  });

  it('leaves the extensions out when they are not set', () => {
    const body = encodeProblem(new ORPCError('CONFLICT', { status: 409, message: 'Taken' }));
    expect(body).not.toHaveProperty('field');
    expect(body).not.toHaveProperty('hint');
  });
});

describe('problemJsonSchema', () => {
  it('is an embeddable object schema without a dialect marker', () => {
    expect(problemJsonSchema).not.toHaveProperty('$schema');
    expect(problemJsonSchema).toMatchObject({
      type: 'object',
      required: ['type', 'title', 'status', 'code'],
    });
  });
});
