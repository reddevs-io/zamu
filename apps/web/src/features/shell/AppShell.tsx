import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NewProjectDialogHost } from '~/features/projects/NewProjectDialogHost';
import { meQuery, projectsQuery } from '~/features/projects/queries';
import { QuickCreateDialog } from '~/features/tasks/QuickCreateDialog';
import { useSignOut } from '~/lib/auth-client';
import { AppFrame, Rail } from '~/ui';
import { useShellHotkeys } from './hotkeys';
import { NewProjectProvider } from './new-project';
import { PageSearchProvider } from './page-search';
import { PROJECTS_HREF, projectHref, projectKeyFromPath, SETTINGS_HREF } from './paths';
import { QuickCreateProvider } from './quick-create';

export interface AppShellProps {
  /** The signed-in person, from the session (shown until me.get answers). */
  user: { name: string };
  children: ReactNode;
}

/**
 * Signed-in shell: the rail, the global shortcuts (C quick create, P new project, / page search) and
 * the dialogs they open. Pages render inside the content area.
 */
export function AppShell({ user, children }: AppShellProps) {
  return (
    <QuickCreateProvider>
      <NewProjectProvider>
        <PageSearchProvider>
          <ShellFrame user={user}>{children}</ShellFrame>
          <QuickCreateDialog />
          <NewProjectDialogHost />
        </PageSearchProvider>
      </NewProjectProvider>
    </QuickCreateProvider>
  );
}

function ShellFrame({ user, children }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentKey = projectKeyFromPath(pathname);
  const me = useQuery(meQuery());
  const projects = useQuery(projectsQuery());
  const signOut = useSignOut();
  useShellHotkeys(currentKey);

  const workspaceName = me.data?.workspace.name ?? 'Workspace';
  return (
    <AppFrame
      rail={
        <Rail
          workspace={{ name: workspaceName, href: PROJECTS_HREF }}
          nav={[
            { id: 'projects', label: 'Projects', href: PROJECTS_HREF, isCurrent: pathname === PROJECTS_HREF },
          ]}
          projects={(projects.data?.items ?? []).map((project) => ({
            key: project.key,
            name: project.name,
            openCount: project.openCount,
            href: projectHref(project.key),
            isCurrent: project.key === currentKey,
          }))}
          settings={{ href: SETTINGS_HREF, isCurrent: pathname.startsWith('/settings') }}
          user={{ name: me.data?.user.name ?? user.name }}
          userActions={[{ id: 'sign-out', label: 'Sign out', onAction: () => void signOut() }]}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
