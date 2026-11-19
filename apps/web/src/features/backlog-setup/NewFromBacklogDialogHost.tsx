import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { CreateProjectFromBacklogInput } from '@zamu/contracts';
import { createProjectFromBacklogFn, detectBacklogRepositoryFn } from '~/features/backlog/server';
import {
  type DetectRepository,
  NewFromBacklogDialog,
  newFromBacklogFailure,
} from '~/features/projects/NewFromBacklogDialog';
import { unwrap } from '~/features/settings/result';
import { orpc } from '~/lib/orpc';
import { connectionsQuery } from './queries';

// New project from Backlog.md wired to the server (the projects page and the setup's Mode step open it).

export interface NewFromBacklogDialogHostProps {
  isOpen: boolean;
  onClose: () => void;
  /** Defaults to reading the repository on the server (detectBacklogRepositoryFn). */
  detect?: DetectRepository;
}

const detectOnServer: DetectRepository = (input) => unwrap(detectBacklogRepositoryFn({ data: input }));

/** The dialog wired to the server: creates the project, then opens its setup at Mappings. */
export function NewFromBacklogDialogHost({
  isOpen,
  onClose,
  detect = detectOnServer,
}: NewFromBacklogDialogHostProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const connections = useQuery({ ...connectionsQuery(), enabled: isOpen });
  const create = useMutation({
    mutationFn: (input: CreateProjectFromBacklogInput) => unwrap(createProjectFromBacklogFn({ data: input })),
  });

  const onSubmit = async (input: CreateProjectFromBacklogInput) => {
    let key: string;
    try {
      key = (await create.mutateAsync(input)).key;
    } catch (error) {
      return newFromBacklogFailure(error, input.key);
    }
    void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    onClose();
    void router.navigate({
      to: '/p/$projectKey/backlog-setup',
      params: { projectKey: key },
      search: { mode: input.mode, step: 'mappings', connection: input.connectionId },
    });
    return null;
  };

  return (
    <NewFromBacklogDialog
      isOpen={isOpen}
      onClose={onClose}
      connections={connections.data?.items}
      encryptionReady={connections.data?.encryptionReady ?? true}
      onSubmit={onSubmit}
      detect={detect}
    />
  );
}
