// /api/v1 procedures. Each one hands the parsed input and the actor to a core service and returns
// its result; the rules live in @pm/core.
import {
  createProject,
  createTask,
  getMe,
  getTask,
  listMembers,
  listProjects,
  listTaskActivity,
  listTasks,
  updateProject,
  updateTask,
} from '@pm/core';
import { api } from './base';

export const router = api.router({
  me: {
    get: api.me.get.handler(({ context }) => getMe(context.core, context.actor)),
  },
  projects: {
    list: api.projects.list.handler(({ context }) => listProjects(context.core, context.actor)),
    create: api.projects.create.handler(({ context, input }) =>
      createProject(context.core, context.actor, input),
    ),
    update: api.projects.update.handler(({ context, input }) =>
      updateProject(context.core, context.actor, input),
    ),
  },
  tasks: {
    list: api.tasks.list.handler(({ context, input }) => listTasks(context.core, context.actor, input)),
    get: api.tasks.get.handler(({ context, input }) => getTask(context.core, context.actor, input)),
    create: api.tasks.create.handler(({ context, input }) => createTask(context.core, context.actor, input)),
    update: api.tasks.update.handler(({ context, input }) => updateTask(context.core, context.actor, input)),
    activity: api.tasks.activity.handler(({ context, input }) =>
      listTaskActivity(context.core, context.actor, input),
    ),
  },
  members: {
    list: api.members.list.handler(({ context }) => listMembers(context.core, context.actor)),
  },
});

export type ApiRouter = typeof router;
