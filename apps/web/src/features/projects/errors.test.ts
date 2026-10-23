import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';
import { newProjectFailure } from './errors';

const repositoryMessage =
  'Payments (PAY) already uses gitlab.com/reddevs/payments. A repository can belong to one project.';

function conflict(issues?: { path: string; message: string }[]) {
  return new ORPCError('CONFLICT', {
    status: 409,
    message: issues ? repositoryMessage : 'Project key BIL is already used in this workspace',
    data: { requestId: 'req_1', ...(issues ? { issues } : {}) },
  });
}

describe('newProjectFailure', () => {
  it('puts a taken repository on the repository field', () => {
    expect(newProjectFailure(conflict([{ path: 'repository', message: repositoryMessage }]), 'BIL')).toEqual({
      field: 'repository',
      message: repositoryMessage,
    });
  });

  it('keeps other conflicts on the key field', () => {
    expect(newProjectFailure(conflict(), 'BIL')).toEqual({
      field: 'key',
      message: 'BIL is already used by another project. Pick another key.',
    });
  });

  it('maps a repository validation issue to the field', () => {
    const error = new ORPCError('BAD_REQUEST', {
      status: 400,
      message: 'Input validation failed',
      data: { issues: [{ path: 'repository', message: 'Not a clone URL.' }] },
    });
    expect(newProjectFailure(error, 'BIL')).toEqual({ field: 'repository', message: 'Not a clone URL.' });
  });
});
