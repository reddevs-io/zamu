import { describe, expect, it } from 'vitest';
import { type Actor, authorize, can, type KeyOwner } from './authz';
import { Forbidden } from './errors';

const workspaceId = '0190b1d2-0000-7000-8000-000000000001';
const p1 = '0190b1d2-0000-7000-8000-0000000000a1';
const p2 = '0190b1d2-0000-7000-8000-0000000000a2';

const person = (role: Actor['role'], scope?: Actor['scope']): Actor => ({
  userId: `user-${role}`,
  kind: 'person',
  workspaceId,
  role,
  onBehalfOfId: null,
  ...(scope ? { scope, apiKeyId: 'key' } : {}),
});
const agent = (scope: Actor['scope']): Actor => ({
  userId: 'agent-1',
  kind: 'agent',
  workspaceId,
  role: 'member',
  scope,
  onBehalfOfId: 'user-member',
  apiKeyId: 'key',
});
const project = (projectId: string) => ({ type: 'project' as const, projectId });
const owner = (o: KeyOwner) => ({ type: 'apiKeyOwner' as const, owner: o });

describe('can', () => {
  it('lets every member read and write within key scope', () => {
    const member = person('member');
    expect(can(member, 'project.read', project(p1))).toBe(true);
    expect(can(member, 'task.write', project(p1))).toBe(true);
    expect(can(member, 'project.create')).toBe(true);

    const scoped = agent({ projects: [p1], access: 'write' });
    expect(can(scoped, 'project.read', project(p1))).toBe(true);
    expect(can(scoped, 'project.read', project(p2))).toBe(false);
    expect(can(scoped, 'task.write', project(p1))).toBe(true);
    expect(can(scoped, 'task.write', project(p2))).toBe(false);
    // A key limited to some projects cannot create new ones.
    expect(can(scoped, 'project.create')).toBe(false);
  });

  it('keeps read-only keys from writing', () => {
    const readOnly = agent({ projects: 'all', access: 'read' });
    expect(can(readOnly, 'project.read', project(p1))).toBe(true);
    expect(can(readOnly, 'task.write', project(p1))).toBe(false);
    expect(can(readOnly, 'project.update', project(p1))).toBe(false);
    expect(can(readOnly, 'project.create')).toBe(false);
    expect(() => authorize(readOnly, 'task.write', project(p1))).toThrow('This API key is read-only');
  });

  it('reserves member management to admins acting as people', () => {
    expect(can(person('owner'), 'member.manage')).toBe(true);
    expect(can(person('admin'), 'member.manage')).toBe(true);
    expect(can(person('member'), 'member.manage')).toBe(false);
    expect(can({ ...agent({ projects: 'all', access: 'write' }), role: 'admin' }, 'member.manage')).toBe(
      false,
    );
    expect(can(person('admin', { projects: 'all', access: 'read' }), 'member.manage')).toBe(false);
    expect(can(person('admin', { projects: 'all', access: 'write' }), 'member.manage')).toBe(true);
  });

  it('applies the API key ownership rules', () => {
    const self = person('member');
    const myAgent: KeyOwner = { id: 'agent-1', kind: 'agent', responsibleUserId: 'user-member' };
    const otherAgent: KeyOwner = { id: 'agent-2', kind: 'agent', responsibleUserId: 'someone-else' };
    const otherPerson: KeyOwner = { id: 'user-x', kind: 'person', responsibleUserId: null };

    expect(
      can(self, 'apiKey.create', owner({ id: self.userId, kind: 'person', responsibleUserId: null })),
    ).toBe(true);
    expect(can(self, 'apiKey.create', owner(myAgent))).toBe(true);
    expect(can(self, 'apiKey.revoke', owner(myAgent))).toBe(true);
    expect(can(self, 'apiKey.create', owner(otherAgent))).toBe(false);
    expect(can(self, 'apiKey.create', owner(otherPerson))).toBe(false);

    const admin = person('admin');
    expect(can(admin, 'apiKey.create', owner(otherAgent))).toBe(true);
    expect(can(admin, 'apiKey.create', owner(otherPerson))).toBe(false);
    expect(can(admin, 'apiKey.revoke', owner(otherPerson))).toBe(true);
    expect(can(admin, 'apiKey.listWorkspace')).toBe(true);
    expect(can(self, 'apiKey.listWorkspace')).toBe(false);
  });

  it('never lets agents create agents or keys', () => {
    const bot = agent({ projects: 'all', access: 'write' });
    const itself: KeyOwner = { id: bot.userId, kind: 'agent', responsibleUserId: 'user-member' };
    expect(can(bot, 'apiKey.create', owner(itself))).toBe(false);
    expect(can(bot, 'member.manage')).toBe(false);
    expect(() => authorize(bot, 'apiKey.create', owner(itself))).toThrow(Forbidden);
    expect(() => authorize(bot, 'member.manage')).toThrow('Agents cannot manage members, agents or API keys');
  });
});
