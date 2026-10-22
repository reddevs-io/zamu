import { type InferContractRouterInputs, type InferContractRouterOutputs, oc } from '@orpc/contract';
import { ActivityList, Me, MemberList, Project, ProjectList, Task, TaskListPage } from './entities';
import {
  CreateProjectInput,
  CreateTaskInput,
  GetTaskInput,
  ListTaskActivityInput,
  ListTasksInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './inputs';
import { PROBLEM_STATUS, ProblemData } from './problem';

/** Every path in the contract starts with this prefix. Mount the OpenAPI handler without a prefix. */
export const API_PREFIX = '/api/v1';

/**
 * Errors any procedure may return. Bodies follow the Problem schema when the server sets
 * `customErrorResponseBodyEncoder`; generate the document with `customErrorResponseBodySchema:
 * problemJsonSchema` so it matches.
 */
export const apiErrors = {
  BAD_REQUEST: { status: PROBLEM_STATUS.BAD_REQUEST, data: ProblemData },
  UNAUTHORIZED: { status: PROBLEM_STATUS.UNAUTHORIZED, data: ProblemData },
  FORBIDDEN: { status: PROBLEM_STATUS.FORBIDDEN, data: ProblemData },
  NOT_FOUND: { status: PROBLEM_STATUS.NOT_FOUND, data: ProblemData },
  CONFLICT: { status: PROBLEM_STATUS.CONFLICT, data: ProblemData },
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
        description: 'The signed-in user or API key owner, their workspace, role and key scope.',
      })
      .output(Me),
  },
  projects: {
    list: base
      .route({
        method: 'GET',
        path: '/projects',
        tags: ['projects'],
        summary: 'List projects',
        description: 'Projects the caller can read, with open task counts per status.',
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
        description: 'The key can change only while the project has no tasks.',
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
        summary: 'List tasks of a project',
        description:
          'Ordered by status, then priority (highest first), then last update. Paginate with nextCursor.',
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
      })
      .input(CreateTaskInput)
      .output(Task),
    update: base
      .route({
        method: 'PATCH',
        path: '/tasks/{key}',
        tags: ['tasks'],
        summary: 'Update a task',
        description: 'Send only the fields to change. assignee null unassigns, description null clears.',
      })
      .input(UpdateTaskInput)
      .output(Task),
    activity: base
      .route({
        method: 'GET',
        path: '/tasks/{key}/activity',
        tags: ['tasks'],
        summary: 'List the activity of a task',
        description: 'Oldest first.',
      })
      .input(ListTaskActivityInput)
      .output(ActivityList),
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
