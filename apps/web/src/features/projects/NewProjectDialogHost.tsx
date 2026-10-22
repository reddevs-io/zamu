import type { CreateProjectInput } from '@pm/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useNewProject } from '~/features/shell/new-project';
import { projectHref } from '~/features/shell/paths';
import { orpc } from '~/lib/orpc';
import { newProjectFailure } from './errors';
import { NewProjectDialog } from './NewProjectDialog';

/** The New project dialog wired to the API. The shell renders it once; P or a button opens it. */
export function NewProjectDialogHost() {
  const { isOpen, close } = useNewProject();
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation(orpc.projects.create.mutationOptions());

  const onSubmit = async (input: CreateProjectInput) => {
    let key: string;
    try {
      key = (await create.mutateAsync(input)).key;
    } catch (error) {
      return newProjectFailure(error, input.key);
    }
    // The rail and the projects table pick the new project up; the task list loads its own data.
    void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    close();
    void router.navigate({ href: projectHref(key) });
    return null;
  };

  return <NewProjectDialog isOpen={isOpen} onClose={close} onSubmit={onSubmit} />;
}
