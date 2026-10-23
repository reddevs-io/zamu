import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useCallback } from 'react';
import { createRefusalText, isMirrored } from '~/features/project-header/mirror';
import { NewProjectDialogHost } from '~/features/projects/NewProjectDialogHost';
import { meQuery, projectsQuery } from '~/features/projects/queries';
import { QuickCreateDialog } from '~/features/tasks/QuickCreateDialog';
import { ThemeErrorToast, useThemeChoice } from '~/features/theme/ThemeChoice';
import { useSignOut } from '~/lib/auth-client';
import { AppFrame, Rail, type UserMenuItem } from '~/ui';
import { useGoToHotkeys, useShellHotkeys } from './hotkeys';
import { NewProjectProvider } from './new-project';
import { PageSearchProvider } from './page-search';
import {
  APPEARANCE_HREF,
  MY_TASKS_HREF,
  PROJECTS_HREF,
  projectHref,
  projectKeyFromPath,
  SETTINGS_HREF,
} from './paths';
import { QuickCreateProvider } from './quick-create';
import { userMenuSubtitle } from './user-menu';

export interface AppShellProps {
  /** The signed-in person, from the session (shown until me.get answers). */
  user: { name: string };
  children: ReactNode;
}

/**
 * Signed-in shell: the rail with the account menu, the global shortcuts (C quick create, P new project,
 * / page search, G then M for My tasks) and the dialogs they open. Pages render inside the content area.
 * Quick create refuses projects whose tasks come from Backlog.md, with the New button's tooltip text.
 */
export function AppShell({ user, children }: AppShellProps) {
  const queryClient = useQueryClient();
  const refuse = useCallback(
    (projectKey: string) => {
      const project = queryClient
        .getQueryData(projectsQuery().queryKey)
        ?.items.find((item) => item.key === projectKey);
      return project && isMirrored(project) ? createRefusalText(project.name) : null;
    },
    [queryClient],
  );
  return (
    <QuickCreateProvider refuse={refuse}>
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
  const navigate = useNavigate();
  const currentKey = projectKeyFromPath(pathname);
  const me = useQuery(meQuery());
  const projects = useQuery(projectsQuery());
  const signOut = useSignOut();
  const theme = useThemeChoice();
  useShellHotkeys(currentKey);
  useGoToHotkeys({ m: () => void navigate({ to: MY_TASKS_HREF }) });

  const workspaceName = me.data?.workspace.name ?? 'Workspace';
  const accountGroups: UserMenuItem[][] = [
    [
      { id: 'appearance', label: 'Appearance', href: APPEARANCE_HREF },
      {
        id: 'switch-workspace',
        label: 'Switch workspace',
        // v1 has one workspace per instance: the submenu lists the current one.
        submenu: [{ id: 'workspace-current', label: workspaceName, href: PROJECTS_HREF, isCurrent: true }],
      },
    ],
    [{ id: 'sign-out', label: 'Sign out', onAction: () => void signOut() }],
  ];
  return (
    <AppFrame
      rail={
        <Rail
          workspace={{ name: workspaceName, href: PROJECTS_HREF }}
          nav={[
            { id: 'my-tasks', label: 'My tasks', href: MY_TASKS_HREF, isCurrent: pathname === MY_TASKS_HREF },
            { id: 'projects', label: 'Projects', href: PROJECTS_HREF, isCurrent: pathname === PROJECTS_HREF },
          ]}
          projects={(projects.data?.items ?? []).map((project) => ({
            key: project.key,
            name: project.name,
            openCount: project.openCount,
            href: projectHref(project.key),
            isCurrent: project.key === currentKey,
            mirrored: isMirrored(project),
          }))}
          settings={{ href: SETTINGS_HREF, isCurrent: pathname.startsWith('/settings') }}
          user={{ name: me.data?.user.name ?? user.name }}
          userMenu={{
            subtitle: me.data ? userMenuSubtitle(me.data) : undefined,
            // Agents never sign in to the web app; a person's session can always change the theme.
            theme: theme.value,
            onThemeChange: theme.change,
            groups: accountGroups,
          }}
        />
      }
    >
      {children}
      <ThemeErrorToast error={theme.error} onDismiss={theme.dismissError} />
    </AppFrame>
  );
}
