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
    gitConnections: r.many.gitConnection(),
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
    milestones: r.many.milestone(),
    cycles: r.many.cycle(),
    /** M3: at most one row (backlog_source.project_id is unique). */
    backlogSource: r.one.backlogSource({ from: r.project.id, to: r.backlogSource.projectId }),
  },
  milestone: {
    project: r.one.project({ from: r.milestone.projectId, to: r.project.id, optional: false }),
    createdBy: r.one.user({
      from: r.milestone.createdById,
      to: r.user.id,
      alias: 'milestone_created_by',
      optional: false,
    }),
    tasks: r.many.task(),
    backlogFiles: r.many.backlogFile(),
  },
  cycle: {
    project: r.one.project({ from: r.cycle.projectId, to: r.project.id, optional: false }),
    endedBy: r.one.user({ from: r.cycle.endedById, to: r.user.id, alias: 'cycle_ended_by' }),
    tasks: r.many.task(),
    rollovers: r.many.cycleRollover({ alias: 'cycle_rollover_cycle' }),
  },
  cycleRollover: {
    cycle: r.one.cycle({
      from: r.cycleRollover.cycleId,
      to: r.cycle.id,
      alias: 'cycle_rollover_cycle',
      optional: false,
    }),
    toCycle: r.one.cycle({
      from: r.cycleRollover.toCycleId,
      to: r.cycle.id,
      alias: 'cycle_rollover_to_cycle',
    }),
    task: r.one.task({ from: r.cycleRollover.taskId, to: r.task.id, optional: false }),
  },
  comment: {
    project: r.one.project({ from: r.comment.projectId, to: r.project.id, optional: false }),
    task: r.one.task({ from: r.comment.taskId, to: r.task.id, optional: false }),
    author: r.one.user({ from: r.comment.authorId, to: r.user.id, alias: 'comment_author', optional: false }),
    onBehalfOf: r.one.user({ from: r.comment.onBehalfOfId, to: r.user.id, alias: 'comment_on_behalf_of' }),
    mentions: r.many.commentMention(),
  },
  commentMention: {
    comment: r.one.comment({ from: r.commentMention.commentId, to: r.comment.id, optional: false }),
    user: r.one.user({ from: r.commentMention.userId, to: r.user.id, optional: false }),
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
    milestone: r.one.milestone({ from: r.task.milestoneId, to: r.milestone.id }),
    cycle: r.one.cycle({ from: r.task.cycleId, to: r.cycle.id }),
    activity: r.many.activity(),
    comments: r.many.comment(),
    rollovers: r.many.cycleRollover(),
    backlogFiles: r.many.backlogFile(),
  },
  activity: {
    project: r.one.project({ from: r.activity.projectId, to: r.project.id, optional: false }),
    task: r.one.task({ from: r.activity.taskId, to: r.task.id }),
    /** Null for system entries (the hourly job ending a cycle). */
    actor: r.one.user({ from: r.activity.actorId, to: r.user.id, alias: 'activity_actor' }),
    onBehalfOf: r.one.user({ from: r.activity.onBehalfOfId, to: r.user.id, alias: 'activity_on_behalf_of' }),
  },
  gitConnection: {
    workspace: r.one.organization({
      from: r.gitConnection.workspaceId,
      to: r.organization.id,
      optional: false,
    }),
    createdBy: r.one.user({
      from: r.gitConnection.createdById,
      to: r.user.id,
      alias: 'git_connection_created_by',
      optional: false,
    }),
    sources: r.many.backlogSource(),
  },
  backlogSource: {
    project: r.one.project({ from: r.backlogSource.projectId, to: r.project.id, optional: false }),
    /** Null once the connection was deleted (the source is paused). */
    connection: r.one.gitConnection({ from: r.backlogSource.connectionId, to: r.gitConnection.id }),
    createdBy: r.one.user({
      from: r.backlogSource.createdById,
      to: r.user.id,
      alias: 'backlog_source_created_by',
      optional: false,
    }),
    detachedBy: r.one.user({
      from: r.backlogSource.detachedById,
      to: r.user.id,
      alias: 'backlog_source_detached_by',
    }),
    files: r.many.backlogFile(),
  },
  backlogFile: {
    source: r.one.backlogSource({ from: r.backlogFile.sourceId, to: r.backlogSource.id, optional: false }),
    task: r.one.task({ from: r.backlogFile.taskId, to: r.task.id }),
    milestone: r.one.milestone({ from: r.backlogFile.milestoneId, to: r.milestone.id }),
  },
}));
