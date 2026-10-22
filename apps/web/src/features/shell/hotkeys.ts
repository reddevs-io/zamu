import { useHotkeys } from '~/ui';
import { useNewProject } from './new-project';
import { useFocusPageSearch } from './page-search';
import { useQuickCreate } from './quick-create';

/**
 * Shortcuts the shell owns on every signed-in page: C quick create (in the current project, if any),
 * P new project, / page search. Plain keys are ignored while typing and inside dialogs and menus.
 */
export function useShellHotkeys(currentProjectKey: string | undefined): void {
  const quickCreate = useQuickCreate();
  const newProject = useNewProject();
  const focusSearch = useFocusPageSearch();
  useHotkeys({
    c: () => quickCreate.open(currentProjectKey),
    p: () => newProject.open(),
    '/': () => focusSearch(),
  });
}
