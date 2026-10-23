import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectSummary } from '~/features/project-header';
import { client } from '~/lib/orpc';
import { Banner, Button, EmptyState } from '~/ui';
import { invalidatePlanning } from './queries';

// Shown on /p/PAY/milestones or /p/PAY/cycles when the project has the feature turned off (a bookmark,
// a shared link). Not in the design: it reuses the empty state layout.

export interface FeatureOffProps {
  projectKey: string;
  feature: 'milestones' | 'cycles';
}

export function FeatureOff({ projectKey, feature }: FeatureOffProps) {
  const project = useProjectSummary(projectKey);
  const queryClient = useQueryClient();
  const turnOn = useMutation({
    mutationFn: () =>
      client.projects.update({
        project: projectKey,
        ...(feature === 'milestones' ? { usesMilestones: true } : { usesCycles: true }),
      }),
    onSuccess: () => invalidatePlanning(queryClient),
  });
  const name = project?.name ?? projectKey;
  const label = feature === 'milestones' ? 'Milestones' : 'Cycles';
  return (
    <div className="flex flex-col gap-4 px-6 py-12">
      {turnOn.isError ? (
        <Banner className="max-w-[640px]">Couldn't turn {feature} on. You may not have permission.</Banner>
      ) : null}
      <EmptyState
        title={`${label} are off in ${name}`}
        text={`Turning them on brings back the ${label} tab, filter and task fields. ${label} made before keep their tasks.`}
        action={
          <Button isPending={turnOn.isPending} onPress={() => turnOn.mutate()}>
            Turn on {feature}
          </Button>
        }
      />
    </div>
  );
}
