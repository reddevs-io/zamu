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

  it('lets only people signed in with a session change their preferences', () => {
    expect(can(person('member'), 'profile.update')).toBe(true);
    expect(can(person('owner', { projects: 'all', access: 'write' }), 'profile.update')).toBe(false);
    expect(can(agent({ projects: 'all', access: 'write' }), 'profile.update')).toBe(false);
    expect(
      can(
        { ...agent({ projects: 'all', access: 'write' }), scope: undefined, apiKeyId: undefined },
        'profile.update',
      ),
    ).toBe(false);
    // A read-only key hears why: keys, not read access.
    expect(() => authorize(person('member', { projects: 'all', access: 'read' }), 'profile.update')).toThrow(
      /not with an API key/,
    );
  });

  it('covers M2 planning and comment writes with task.write and feature switches with project.update', () => {
    const scoped = agent({ projects: [p1], access: 'write' });
    expect(can(scoped, 'task.write', project(p1))).toBe(true);
    expect(can(scoped, 'project.update', project(p1))).toBe(true);
    expect(can(scoped, 'project.update', project(p2))).toBe(false);
    expect(can(agent({ projects: [p1], access: 'read' }), 'project.update', project(p1))).toBe(false);
  });
});

describe('M3 actions', () => {
  it('lets owners and admins manage git connections, people only', () => {
    expect(can(person('owner'), 'connection.manage')).toBe(true);
    expect(can(person('admin'), 'connection.manage')).toBe(true);
    expect(can(person('member'), 'connection.manage')).toBe(false);
    expect(can(person('admin', { projects: 'all', access: 'write' }), 'connection.manage')).toBe(true);
    expect(can(person('admin', { projects: [p1], access: 'write' }), 'connection.manage')).toBe(false);
    expect(can(person('admin', { projects: 'all', access: 'read' }), 'connection.manage')).toBe(false);
    expect(can({ ...agent({ projects: 'all', access: 'write' }), role: 'admin' }, 'connection.manage')).toBe(
      false,
    );
    expect(() => authorize(person('member'), 'connection.manage')).toThrow(
      new Forbidden('Only workspace admins can add, change or delete git connections'),
    );
  });

  it('lets owners and admins manage Backlog.md sources within key scope', () => {
    expect(can(person('owner'), 'backlog.manage', project(p1))).toBe(true);
    expect(can(person('admin'), 'backlog.manage', project(p1))).toBe(true);
    expect(can(person('member'), 'backlog.manage', project(p1))).toBe(false);
    expect(can(person('admin'), 'backlog.manage')).toBe(false);
    expect(can(person('admin', { projects: 'all', access: 'write' }), 'backlog.manage', project(p1))).toBe(
      true,
    );
    expect(can(person('admin', { projects: [p2], access: 'write' }), 'backlog.manage', project(p1))).toBe(
      false,
    );
    expect(can(agent({ projects: 'all', access: 'write' }), 'backlog.manage', project(p1))).toBe(false);
    expect(() => authorize(person('member'), 'backlog.manage', project(p1))).toThrow(
      new Forbidden('Only workspace admins can set up, change or detach Backlog.md'),
    );
  });

  it('lets owners and admins delete a project, through a key only a workspace-wide writer', () => {
    expect(can(person('owner'), 'project.delete', project(p1))).toBe(true);
    expect(can(person('admin'), 'project.delete', project(p1))).toBe(true);
    expect(can(person('member'), 'project.delete', project(p1))).toBe(false);
    expect(can(person('owner'), 'project.delete')).toBe(false);
    expect(can(person('owner', { projects: 'all', access: 'write' }), 'project.delete', project(p1))).toBe(
      true,
    );
    expect(can(person('owner', { projects: [p1], access: 'write' }), 'project.delete', project(p1))).toBe(
      false,
    );
    expect(can(person('admin', { projects: 'all', access: 'read' }), 'project.delete', project(p1))).toBe(
      false,
    );
    expect(
      can({ ...agent({ projects: 'all', access: 'write' }), role: 'admin' }, 'project.delete', project(p1)),
    ).toBe(false);
    expect(can({ ...agent(undefined), role: 'owner' }, 'project.delete', project(p1))).toBe(false);
    expect(() => authorize(person('member'), 'project.delete', project(p1))).toThrow(
      new Forbidden('Only owners and admins can delete a project.'),
    );
    expect(() =>
      authorize(agent({ projects: 'all', access: 'write' }), 'project.delete', project(p1)),
    ).toThrow(new Forbidden('Only owners and admins can delete a project.'));
    expect(() =>
      authorize(person('owner', { projects: 'all', access: 'read' }), 'project.delete', project(p1)),
    ).toThrow(new Forbidden('This API key is read-only'));
  });

  it('lets admins and agents whose key writes the project refresh', () => {
    expect(can(person('owner'), 'backlog.refresh', project(p1))).toBe(true);
    expect(can(person('admin'), 'backlog.refresh', project(p1))).toBe(true);
    expect(can(person('member'), 'backlog.refresh', project(p1))).toBe(false);
    expect(can(agent({ projects: [p1], access: 'write' }), 'backlog.refresh', project(p1))).toBe(true);
    expect(can(agent({ projects: 'all', access: 'write' }), 'backlog.refresh', project(p1))).toBe(true);
    expect(can(agent({ projects: [p2], access: 'write' }), 'backlog.refresh', project(p1))).toBe(false);
    expect(can(agent({ projects: [p1], access: 'read' }), 'backlog.refresh', project(p1))).toBe(false);
    expect(can(person('admin', { projects: [p1], access: 'read' }), 'backlog.refresh', project(p1))).toBe(
      false,
    );
    expect(() =>
      authorize(agent({ projects: [p1], access: 'read' }), 'backlog.refresh', project(p1)),
    ).toThrow(new Forbidden('This API key is read-only'));
    expect(() => authorize(person('member'), 'backlog.refresh', project(p1))).toThrow(
      new Forbidden('Only workspace admins and agents with write access can refresh Backlog.md'),
    );
  });

  it('lets anyone who reads the project read its source', () => {
    expect(can(person('member'), 'backlog.read', project(p1))).toBe(true);
    expect(can(agent({ projects: [p1], access: 'read' }), 'backlog.read', project(p1))).toBe(true);
    expect(can(agent({ projects: [p2], access: 'read' }), 'backlog.read', project(p1))).toBe(false);
    expect(() => authorize(agent({ projects: [p2], access: 'read' }), 'backlog.read', project(p1))).toThrow(
      new Forbidden('Your API key does not cover this project'),
    );
  });
});
