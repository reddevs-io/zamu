import { createFileRoute, redirect } from '@tanstack/react-router';

// My tasks is gone since M5: Home's Mine tab lists what is assigned to you. Old links land on Home.
export const Route = createFileRoute('/_app/my-tasks')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});
