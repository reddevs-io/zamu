import { createFileRoute, redirect } from '@tanstack/react-router';
import { safeParseTaskKey } from '@zamu/contracts';

// M4's dashboard is Home (/) since M5. Old links land there: ?scope=everyone opens the Everyone tab, and
// ?task=PAY-140 (the dashboard's side panel) opens that task's view.
export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: (search: Record<string, unknown>): { scope?: 'everyone'; task?: string } => ({
    ...(search.scope === 'everyone' ? { scope: 'everyone' } : {}),
    ...(typeof search.task === 'string' ? { task: search.task } : {}),
  }),
  beforeLoad: ({ search }) => {
    const key = search.task?.trim().toUpperCase();
    const task = key ? safeParseTaskKey(key) : null;
    if (key && task) {
      throw redirect({
        to: '/p/$projectKey/$taskKey',
        params: { projectKey: task.projectKey, taskKey: key },
        replace: true,
      });
    }
    throw redirect({
      to: '/',
      search: search.scope === 'everyone' ? { tab: 'everyone' } : {},
      replace: true,
    });
  },
});
