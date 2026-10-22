import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { API_PREFIX, contract } from './contract';

function procedures(router: unknown, path: string[] = []): [string, AnyContractProcedure][] {
  if (isContractProcedure(router)) return [[path.join('.'), router]];
  return Object.entries(router as Record<string, unknown>).flatMap(([key, value]) =>
    procedures(value, [...path, key]),
  );
}

const all = procedures(contract);

describe('contract', () => {
  it('exposes exactly the M1 routes under /api/v1', () => {
    const routes = Object.fromEntries(
      all.map(([name, procedure]) => {
        const { method, path } = procedure['~orpc'].route;
        return [name, `${method} ${path}`];
      }),
    );
    expect(routes).toEqual({
      'me.get': 'GET /api/v1/me',
      'projects.list': 'GET /api/v1/projects',
      'projects.create': 'POST /api/v1/projects',
      'projects.update': 'PATCH /api/v1/projects/{project}',
      'tasks.list': 'GET /api/v1/tasks',
      'tasks.get': 'GET /api/v1/tasks/{key}',
      'tasks.create': 'POST /api/v1/tasks',
      'tasks.update': 'PATCH /api/v1/tasks/{key}',
      'tasks.activity': 'GET /api/v1/tasks/{key}/activity',
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
      expect.arrayContaining(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'UNPROCESSABLE_CONTENT']),
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

  it('returns 201 from creates', () => {
    expect(contract.projects.create['~orpc'].route.successStatus).toBe(201);
    expect(contract.tasks.create['~orpc'].route.successStatus).toBe(201);
  });
});
