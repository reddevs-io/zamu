// Authorization: who may do what. Every service calls authorize() (or can()) before touching data.
// Rules from section 5 "Authorization" of the M1 plan:
// - Read: any workspace member, within key scope.
// - Write tasks and create projects: any member, within key scope, and a key needs write access.
// - Manage members, invitations and agents: admins.
// - Create or revoke an agent's keys: admins and the agent's responsible human. Your own keys: yourself.
// - Agents cannot create other agents or keys.
// M2 (section 5 "Authorization (additions)" of the M2 plan):
// - Milestones, cycles, comments and the timeline: read with project.read, write with task.write.
//   Editing or deleting a comment also needs authorship, which comments.ts checks.
// - Turning milestones or cycles on or off: project.update.
// - Your own preferences (theme): people through a session only; API keys get 403.
import type { Actor, WorkspaceRole } from '@pm/auth';
import { Forbidden } from './errors';

export type { Actor, WorkspaceRole };

/** The owner of an API key, as needed to decide who may manage it. */
export interface KeyOwner {
  id: string;
  kind: 'person' | 'agent';
  responsibleUserId: string | null;
}

export type Resource =
  | { type: 'workspace' }
  | { type: 'project'; projectId: string }
  | { type: 'apiKeyOwner'; owner: KeyOwner };

export type Action =
  /** See the workspace: members, the caller's own profile. */
  | 'workspace.read'
  /** Change the caller's own preferences, such as the theme. People signed in with a session. */
  | 'profile.update'
  /** Create a project. Keys need write access to every project. */
  | 'project.create'
  /** Read a project and its tasks, activity, milestones, cycles and comments. */
  | 'project.read'
  /** Rename a project or change its key or description. */
  | 'project.update'
  /** Create and update tasks, milestones and cycles in a project, end cycles, comment. */
  | 'task.write'
  /** Invite people, add agents, remove members. */
  | 'member.manage'
  /** See every API key in the workspace. */
  | 'apiKey.listWorkspace'
  /** See the keys owned by `owner`. */
  | 'apiKey.list'
  /** Create an API key for `owner`. */
  | 'apiKey.create'
  /** Revoke an API key owned by `owner`. */
  | 'apiKey.revoke';

export function isAdmin(actor: Actor): boolean {
  return actor.role === 'owner' || actor.role === 'admin';
}

function keyCoversProject(actor: Actor, projectId: string): boolean {
  if (!actor.scope) return true;
  return actor.scope.projects === 'all' || actor.scope.projects.includes(projectId);
}

function keyCanWrite(actor: Actor): boolean {
  return !actor.scope || actor.scope.access === 'write';
}

/** Workspace-wide writes through a key need write access to all projects. */
function keyCoversWorkspaceWrites(actor: Actor): boolean {
  return !actor.scope || (actor.scope.access === 'write' && actor.scope.projects === 'all');
}

/** Settings actions (members, agents, keys) are for people, and keys must be workspace-wide writers. */
function canManageSettings(actor: Actor): boolean {
  return actor.kind === 'person' && keyCoversWorkspaceWrites(actor);
}

/** True when the actor signed in with a session rather than an API key. */
export function isSession(actor: Actor): boolean {
  return !actor.apiKeyId && !actor.scope;
}

function projectIdOf(resource: Resource | undefined): string | null {
  return resource?.type === 'project' ? resource.projectId : null;
}

/** Whether `actor` may perform `action` on `resource`. Membership of the workspace is a given. */
export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  switch (action) {
    case 'workspace.read':
      return true;
    case 'profile.update':
      return actor.kind === 'person' && isSession(actor);
    case 'project.create':
      return keyCoversWorkspaceWrites(actor);
    case 'project.read': {
      const projectId = projectIdOf(resource);
      return projectId !== null && keyCoversProject(actor, projectId);
    }
    case 'project.update':
    case 'task.write': {
      const projectId = projectIdOf(resource);
      return projectId !== null && keyCoversProject(actor, projectId) && keyCanWrite(actor);
    }
    case 'member.manage':
      return isAdmin(actor) && canManageSettings(actor);
    case 'apiKey.listWorkspace':
      return isAdmin(actor) && actor.kind === 'person';
    case 'apiKey.list': {
      if (resource?.type !== 'apiKeyOwner') return false;
      if (resource.owner.id === actor.userId) return true;
      return actor.kind === 'person' && (isAdmin(actor) || resource.owner.responsibleUserId === actor.userId);
    }
    case 'apiKey.create':
    case 'apiKey.revoke': {
      if (resource?.type !== 'apiKeyOwner' || !canManageSettings(actor)) return false;
      const { owner } = resource;
      if (owner.id === actor.userId) return true;
      if (owner.kind === 'agent') return isAdmin(actor) || owner.responsibleUserId === actor.userId;
      // Admins may revoke anyone's key in the workspace (key hygiene); they never create keys for people.
      return action === 'apiKey.revoke' && isAdmin(actor);
    }
  }
}

const MESSAGES: Record<Action, string> = {
  'workspace.read': 'You cannot read this workspace',
  'profile.update': 'Preferences can be changed only by people signed in to the web app, not with an API key',
  'project.create': 'Creating projects needs a key with write access to all projects',
  'project.read': 'Your API key does not cover this project',
  'project.update': 'You cannot change this project with this API key',
  'task.write': 'You cannot change tasks in this project with this API key',
  'member.manage': 'Only workspace admins can manage members, invitations and agents',
  'apiKey.listWorkspace': 'Only workspace admins can see every API key',
  'apiKey.list': 'You can see only your own keys and keys of agents you are responsible for',
  'apiKey.create': 'You can create keys only for yourself or for agents you are responsible for',
  'apiKey.revoke': 'You can revoke only your own keys or keys of agents you are responsible for',
};

/** Throws Forbidden unless `actor` may perform `action` on `resource`. */
export function authorize(actor: Actor, action: Action, resource?: Resource): void {
  if (can(actor, action, resource)) return;
  let message = MESSAGES[action];
  if (actor.kind === 'agent' && (action === 'member.manage' || action.startsWith('apiKey.'))) {
    message = 'Agents cannot manage members, agents or API keys';
  } else if (actor.scope?.access === 'read' && action !== 'project.read' && action !== 'profile.update') {
    message = 'This API key is read-only';
  }
  throw new Forbidden(message);
}
