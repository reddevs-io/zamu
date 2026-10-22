// Relational query definitions (Drizzle 1.0 relations v2), used by `db.query.*`.
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
  user: {
    responsibleUser: r.one.user({
      from: r.user.responsibleUserId,
      to: r.user.id,
      alias: 'responsible_user',
    }),
    agents: r.many.user({ alias: 'responsible_user' }),
    sessions: r.many.session(),
    accounts: r.many.account(),
    memberships: r.many.member(),
    apiKeys: r.many.apikey(),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false }),
  },
  organization: {
    members: r.many.member(),
    invitations: r.many.invitation(),
    projects: r.many.project(),
  },
  member: {
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
      optional: false,
    }),
    user: r.one.user({ from: r.member.userId, to: r.user.id, optional: false }),
  },
  invitation: {
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
      optional: false,
    }),
    inviter: r.one.user({ from: r.invitation.inviterId, to: r.user.id, optional: false }),
  },
  apikey: {
    user: r.one.user({ from: r.apikey.referenceId, to: r.user.id, optional: false }),
  },
  project: {
    workspace: r.one.organization({ from: r.project.workspaceId, to: r.organization.id, optional: false }),
    tasks: r.many.task(),
  },
  task: {
    project: r.one.project({ from: r.task.projectId, to: r.project.id, optional: false }),
    assignee: r.one.user({ from: r.task.assigneeId, to: r.user.id, alias: 'task_assignee' }),
    createdBy: r.one.user({
      from: r.task.createdById,
      to: r.user.id,
      alias: 'task_created_by',
      optional: false,
    }),
    createdOnBehalfOf: r.one.user({
      from: r.task.createdOnBehalfOfId,
      to: r.user.id,
      alias: 'task_created_on_behalf_of',
    }),
    activity: r.many.activity(),
  },
  activity: {
    project: r.one.project({ from: r.activity.projectId, to: r.project.id, optional: false }),
    task: r.one.task({ from: r.activity.taskId, to: r.task.id }),
    actor: r.one.user({ from: r.activity.actorId, to: r.user.id, alias: 'activity_actor', optional: false }),
    onBehalfOf: r.one.user({ from: r.activity.onBehalfOfId, to: r.user.id, alias: 'activity_on_behalf_of' }),
  },
}));
