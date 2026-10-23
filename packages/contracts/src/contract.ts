import { type InferContractRouterInputs, type InferContractRouterOutputs, oc } from '@orpc/contract';
import { z } from 'zod';
import {
  ActivityList,
  Comment,
  CommentList,
  CycleDetail,
  CycleList,
  Dashboard,
  DashboardCounts,
  Me,
  MemberList,
  MilestoneList,
  MilestoneWithProgress,
  Project,
  ProjectList,
  Task,
  TaskListPage,
  Timeline,
} from './entities';
import {
  CreateCommentInput,
  CreateCycleInput,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  DeleteCommentInput,
  DeleteMilestoneInput,
  EndCycleInput,
  GetCycleInput,
  GetDashboardInput,
  GetMilestoneInput,
  GetTaskInput,
  ListCommentsInput,
  ListCyclesInput,
  ListMilestonesInput,
  ListTaskActivityInput,
  ListTasksInput,
  ListTaskTimelineInput,
  UpdateCommentInput,
  UpdateCycleInput,
  UpdateMeInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './inputs';
import { PROBLEM_STATUS, ProblemData } from './problem';

/** Every path in the contract starts with this prefix. Mount the OpenAPI handler without a prefix. */
export const API_PREFIX = '/api/v1';

/** Data of the TASK_CHANGED error: the task as it is now, so the client can roll back to it. */
export const TaskChangedProblemData = ProblemData.extend({ task: Task });
export type TaskChangedProblemData = z.output<typeof TaskChangedProblemData>;

/**
 * Errors any procedure may return. Bodies follow the Problem schema when the server sets
 * `customErrorResponseBodyEncoder`; generate the document with a Problem schema as
 * `customErrorResponseBodySchema` (problemJsonSchema, or a $ref to a Problem component) so it matches.
 */
export const apiErrors = {
  BAD_REQUEST: { status: PROBLEM_STATUS.BAD_REQUEST, data: ProblemData },
  UNAUTHORIZED: { status: PROBLEM_STATUS.UNAUTHORIZED, data: ProblemData },
  FORBIDDEN: { status: PROBLEM_STATUS.FORBIDDEN, data: ProblemData },
  NOT_FOUND: { status: PROBLEM_STATUS.NOT_FOUND, data: ProblemData },
  CONFLICT: { status: PROBLEM_STATUS.CONFLICT, data: ProblemData },
  /** A task write with a stale ifUpdatedAt (409). */
  TASK_CHANGED: { status: PROBLEM_STATUS.TASK_CHANGED, data: TaskChangedProblemData },
  UNPROCESSABLE_CONTENT: { status: PROBLEM_STATUS.UNPROCESSABLE_CONTENT, data: ProblemData },
};

const base = oc.errors(apiErrors);

export const contract = base.prefix(API_PREFIX).router({
  me: {
    get: base
      .route({
        method: 'GET',
        path: '/me',
        tags: ['me'],
        summary: 'Get the caller',
        description: 'The signed-in user or API key owner, their workspace, role, theme and key scope.',
      })
      .output(Me),
    update: base
      .route({
        method: 'PATCH',
        path: '/me',
        tags: ['me'],
        summary: 'Update your preferences',
        description: 'Sets the theme. People signed in with a session only: API keys get 403.',
      })
      .input(UpdateMeInput)
      .output(Me),
  },
  projects: {
    list: base
      .route({
        method: 'GET',
        path: '/projects',
        tags: ['projects'],
        summary: 'List projects',
        description: 'Projects the caller can read, with open task counts per status and the current cycle.',
      })
      .output(ProjectList),
    create: base
      .route({
        method: 'POST',
        path: '/projects',
        successStatus: 201,
        tags: ['projects'],
        summary: 'Create a project',
      })
      .input(CreateProjectInput)
      .output(Project),
    update: base
      .route({
        method: 'PATCH',
        path: '/projects/{project}',
        tags: ['projects'],
        summary: 'Update a project',
        description:
          'The key can change only while the project has no tasks. usesMilestones and usesCycles turn ' +
          'the features on or off; turning one off keeps its data.',
      })
      .input(UpdateProjectInput)
      .output(Project),
  },
  tasks: {
    list: base
      .route({
        method: 'GET',
        path: '/tasks',
        tags: ['tasks'],
        summary: 'List tasks',
        description:
          'Tasks of one or more projects, or of every readable project when project is omitted. ' +
          'order=list (default): status, then priority (highest first), then last update. order=board: ' +
          'status, then board rank. Paginate with nextCursor.',
      })
      .input(ListTasksInput)
      .output(TaskListPage),
    get: base
      .route({ method: 'GET', path: '/tasks/{key}', tags: ['tasks'], summary: 'Get a task by key' })
      .input(GetTaskInput)
      .output(Task),
    create: base
      .route({
        method: 'POST',
        path: '/tasks',
        successStatus: 201,
        tags: ['tasks'],
        summary: 'Create a task',
        description: 'New tasks go to the top of their board column. cycle takes a number, current or next.',
      })
      .input(CreateTaskInput)
      .output(Task),
    update: base
      .route({
        method: 'PATCH',
        path: '/tasks/{key}',
        tags: ['tasks'],
        summary: 'Update a task',
        description:
          'Send only the fields to change. null clears assignee, description, milestone and cycle. ' +
          'position places the task before or after another task of its target status column. With ' +
          'ifUpdatedAt, a task changed since then fails with 409 TASK_CHANGED and the current task.',
      })
      .input(UpdateTaskInput)
      .output(Task),
    activity: base
      .route({
        method: 'GET',
        path: '/tasks/{key}/activity',
        tags: ['tasks'],
        summary: 'List the activity of a task',
        description: 'Oldest first. Kept for compatibility; the timeline also has comments.',
      })
      .input(ListTaskActivityInput)
      .output(ActivityList),
    timeline: base
      .route({
        method: 'GET',
        path: '/tasks/{key}/timeline',
        tags: ['tasks'],
        summary: 'Get the timeline of a task',
        description:
          "Activity and comments in one list, oldest first, told apart by kind ('activity' or 'comment').",
      })
      .input(ListTaskTimelineInput)
      .output(Timeline),
  },
  comments: {
    list: base
      .route({
        method: 'GET',
        path: '/tasks/{key}/comments',
        tags: ['comments'],
        summary: 'List the comments of a task',
        description: 'Oldest first. Deleted comments stay with a null body.',
      })
      .input(ListCommentsInput)
      .output(CommentList),
    create: base
      .route({
        method: 'POST',
        path: '/tasks/{key}/comments',
        successStatus: 201,
        tags: ['comments'],
        summary: 'Comment on a task',
        description:
          'Markdown body. Mention members as [@Name](mention:<userId>), @agent-name or @email; the ' +
          'last two are rewritten to the link form.',
      })
      .input(CreateCommentInput)
      .output(Comment),
    update: base
      .route({
        method: 'PATCH',
        path: '/comments/{id}',
        tags: ['comments'],
        summary: 'Edit a comment',
        description: 'Only the author can edit. A deleted comment returns 409.',
      })
      .input(UpdateCommentInput)
      .output(Comment),
    delete: base
      .route({
        method: 'DELETE',
        path: '/comments/{id}',
        tags: ['comments'],
        summary: 'Delete a comment',
        description:
          'Only the author can delete. The comment stays in the timeline with a null body; returns it ' +
          'as it is now. Deleting it again returns 409.',
      })
      .input(DeleteCommentInput)
      .output(Comment),
  },
  milestones: {
    list: base
      .route({
        method: 'GET',
        path: '/projects/{project}/milestones',
        tags: ['milestones'],
        summary: 'List the milestones of a project',
        description: 'With progress counts. Ordered by target date (none last), then name.',
      })
      .input(ListMilestonesInput)
      .output(MilestoneList),
    create: base
      .route({
        method: 'POST',
        path: '/projects/{project}/milestones',
        successStatus: 201,
        tags: ['milestones'],
        summary: 'Create a milestone',
        description: 'Starts Planned. Names are unique per project, ignoring case.',
      })
      .input(CreateMilestoneInput)
      .output(MilestoneWithProgress),
    get: base
      .route({ method: 'GET', path: '/milestones/{id}', tags: ['milestones'], summary: 'Get a milestone' })
      .input(GetMilestoneInput)
      .output(MilestoneWithProgress),
    update: base
      .route({
        method: 'PATCH',
        path: '/milestones/{id}',
        tags: ['milestones'],
        summary: 'Update a milestone',
        description:
          'Send only the fields to change. Completed is set by hand; any other status on a Completed ' +
          'milestone reopens it as Active.',
      })
      .input(UpdateMilestoneInput)
      .output(MilestoneWithProgress),
    delete: base
      .route({
        method: 'DELETE',
        path: '/milestones/{id}',
        successStatus: 204,
        tags: ['milestones'],
        summary: 'Delete a milestone',
        description: 'Its tasks lose the milestone.',
      })
      .input(DeleteMilestoneInput)
      .output(z.void()),
  },
  cycles: {
    list: base
      .route({
        method: 'GET',
        path: '/projects/{project}/cycles',
        tags: ['cycles'],
        summary: 'List the cycles of a project',
        description:
          'Oldest first, with state, days left and task counts. state=current returns the current ' +
          'cycle or an empty list.',
      })
      .input(ListCyclesInput)
      .output(CycleList),
    create: base
      .route({
        method: 'POST',
        path: '/projects/{project}/cycles',
        successStatus: 201,
        tags: ['cycles'],
        summary: 'Create a cycle',
        description:
          'Omitted dates follow the last cycle: the day after it ends, same length. The first cycle ' +
          'starts next Monday and lasts 14 days. Cycles never overlap.',
      })
      .input(CreateCycleInput)
      .output(CycleDetail),
    get: base
      .route({
        method: 'GET',
        path: '/cycles/{project}/{number}',
        tags: ['cycles'],
        summary: 'Get a cycle',
        description: 'number is a cycle number, current or next. Completed cycles list what rolled over.',
      })
      .input(GetCycleInput)
      .output(CycleDetail),
    update: base
      .route({
        method: 'PATCH',
        path: '/cycles/{project}/{number}',
        tags: ['cycles'],
        summary: 'Update a cycle',
        description: 'Dates change only while the cycle is Upcoming; the name until it ends.',
      })
      .input(UpdateCycleInput)
      .output(CycleDetail),
    end: base
      .route({
        method: 'POST',
        path: '/cycles/{project}/{number}/end',
        tags: ['cycles'],
        summary: 'End a cycle now',
        description:
          'Unfinished tasks move to moveTo (a cycle number, or none), else to the next upcoming ' +
          'cycle, else to a new cycle of the same length. Ending an ended cycle changes nothing.',
      })
      .input(EndCycleInput)
      .output(CycleDetail),
  },
  dashboard: {
    get: base
      .route({
        method: 'GET',
        path: '/dashboard',
        tags: ['dashboard'],
        summary: 'Get the dashboard',
        description:
          'What needs someone now, across every readable project: tasks in review, unanswered ' +
          'mentions, stalled work and close deadlines, each with its total and up to 50 items; then ' +
          "one row per project and the agents. scope=mine (default) covers your tasks, your agents' " +
          'tasks and mentions of you; scope=everyone covers the whole workspace.',
      })
      .input(GetDashboardInput)
      .output(Dashboard),
    counts: base
      .route({
        method: 'GET',
        path: '/dashboard/counts',
        tags: ['dashboard'],
        summary: 'Count the dashboard queue',
        description:
          'The totals of the four queue groups for scope=mine and their sum, without items, ' +
          'projects or agents.',
      })
      .output(DashboardCounts),
  },
  members: {
    list: base
      .route({
        method: 'GET',
        path: '/members',
        tags: ['members'],
        summary: 'List workspace members',
        description: 'People and agents, with the responsible human of each agent.',
      })
      .output(MemberList),
  },
});

export type Contract = typeof contract;
/** Inputs as callers send them (before defaults), e.g. `ContractInputs['tasks']['list']`. */
export type ContractInputs = InferContractRouterInputs<Contract>;
/** Outputs as clients receive them, e.g. `ContractOutputs['tasks']['get']`. */
export type ContractOutputs = InferContractRouterOutputs<Contract>;
