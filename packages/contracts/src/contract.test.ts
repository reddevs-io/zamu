import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { API_PREFIX, apiErrors, contract } from './contract';
import { taskFixture } from './testing/fixtures';

function procedures(router: unknown, path: string[] = []): [string, AnyContractProcedure][] {
  if (isContractProcedure(router)) return [[path.join('.'), router]];
  return Object.entries(router as Record<string, unknown>).flatMap(([key, value]) =>
    procedures(value, [...path, key]),
  );
}

const all = procedures(contract);

describe('contract', () => {
  it('exposes exactly the M1 and M2 routes under /api/v1', () => {
    const routes = Object.fromEntries(
      all.map(([name, procedure]) => {
        const { method, path } = procedure['~orpc'].route;
        return [name, `${method} ${path}`];
      }),
    );
    expect(routes).toEqual({
      'me.get': 'GET /api/v1/me',
      'me.update': 'PATCH /api/v1/me',
      'projects.list': 'GET /api/v1/projects',
      'projects.create': 'POST /api/v1/projects',
      'projects.update': 'PATCH /api/v1/projects/{project}',
      'tasks.list': 'GET /api/v1/tasks',
      'tasks.get': 'GET /api/v1/tasks/{key}',
      'tasks.create': 'POST /api/v1/tasks',
      'tasks.update': 'PATCH /api/v1/tasks/{key}',
      'tasks.activity': 'GET /api/v1/tasks/{key}/activity',
      'tasks.timeline': 'GET /api/v1/tasks/{key}/timeline',
      'comments.list': 'GET /api/v1/tasks/{key}/comments',
      'comments.create': 'POST /api/v1/tasks/{key}/comments',
      'comments.update': 'PATCH /api/v1/comments/{id}',
      'comments.delete': 'DELETE /api/v1/comments/{id}',
      'milestones.list': 'GET /api/v1/projects/{project}/milestones',
      'milestones.create': 'POST /api/v1/projects/{project}/milestones',
      'milestones.get': 'GET /api/v1/milestones/{id}',
      'milestones.update': 'PATCH /api/v1/milestones/{id}',
      'milestones.delete': 'DELETE /api/v1/milestones/{id}',
      'cycles.list': 'GET /api/v1/projects/{project}/cycles',
      'cycles.create': 'POST /api/v1/projects/{project}/cycles',
      'cycles.get': 'GET /api/v1/cycles/{project}/{number}',
      'cycles.update': 'PATCH /api/v1/cycles/{project}/{number}',
      'cycles.end': 'POST /api/v1/cycles/{project}/{number}/end',
      'members.list': 'GET /api/v1/members',
    });
    expect(API_PREFIX).toBe('/api/v1');
  });

  it.each(all)('%s has an output schema, a summary, a tag and the shared errors', (_name, procedure) => {
    const def = procedure['~orpc'];
    expect(def.outputSchema).toBeDefined();
    expect(def.route.summary).toBeTruthy();
    expect(def.route.tags?.length).toBe(1);
    expect(Object.keys(def.errorMap)).toEqual(
      expect.arrayContaining([
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'CONFLICT',
        'TASK_CHANGED',
        'UNPROCESSABLE_CONTENT',
      ]),
    );
  });

  it('declares every path parameter as a required input field', () => {
    for (const [name, procedure] of all) {
      const def = procedure['~orpc'];
      const params = [...(def.route.path ?? '').matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
      if (params.length === 0) continue;
      expect(def.inputSchema, name).toBeDefined();
      const result = (def.inputSchema as z.ZodType).safeParse({});
      const missing = (result.error?.issues ?? []).map((issue) => String(issue.path[0]));
      for (const param of params) expect(missing, `${name} ${param}`).toContain(param);
    }
  });

  it('returns 201 from creates, 204 from milestone deletes and 200 otherwise', () => {
    const created = all
      .filter(([, procedure]) => procedure['~orpc'].route.successStatus === 201)
      .map(([name]) => name);
    expect(created.sort()).toEqual([
      'comments.create',
      'cycles.create',
      'milestones.create',
      'projects.create',
      'tasks.create',
    ]);
    expect(contract.milestones.delete['~orpc'].route.successStatus).toBe(204);
    // Comment deletes are soft and return the comment, so the CLI can print it.
    expect(contract.comments.delete['~orpc'].route.successStatus).toBeUndefined();
  });

  it('declares TASK_CHANGED as a 409 that carries the current task', () => {
    const { TASK_CHANGED } = apiErrors;
    expect(TASK_CHANGED.status).toBe(409);
    expect(TASK_CHANGED.data.safeParse({ requestId: 'r1' }).success).toBe(false);
    const task = taskFixture;
    const parsed = TASK_CHANGED.data.parse({ requestId: 'r1', task });
    expect(parsed.task.key).toBe(task.key);
  });

  it('accepts cycle selectors and task keys as path parameters (text in URLs)', () => {
    const get = contract.cycles.get['~orpc'].inputSchema as z.ZodType;
    expect(get.parse({ project: 'pay', number: '12' })).toEqual({ project: 'PAY', number: 12 });
    expect(get.parse({ project: 'PAY', number: 'current' })).toEqual({ project: 'PAY', number: 'current' });
    expect(get.safeParse({ project: 'PAY', number: 'last' }).success).toBe(false);
    const end = contract.cycles.end['~orpc'].inputSchema as z.ZodType;
    expect(end.parse({ project: 'PAY', number: '3', moveTo: 'none' })).toMatchObject({ moveTo: 'none' });
  });
});
