import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NewProjectDialogHost } from '~/features/projects/NewProjectDialogHost';
import { meQuery, projectsQuery } from '~/features/projects/queries';
import { QuickCreateDialog } from '~/features/tasks/QuickCreateDialog';
import { ThemeErrorToast, useThemeChoice } from '~/features/theme/ThemeChoice';
import { useSignOut } from '~/lib/auth-client';
import { AppFrame, Rail, type UserMenuItem } from '~/ui';
import { railCountLabel, useDashboardRailCount, useRefreshDashboardAfterEdits } from './dashboard-count';
import { useGoToHotkeys, useShellHotkeys } from './hotkeys';
import { NewProjectProvider } from './new-project';
import { PageSearchProvider } from './page-search';
import {
  APPEARANCE_HREF,
  DASHBOARD_HREF,
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
 * / page search, G then D for the dashboard, G then M for My tasks) and the dialogs they open. Pages render
 * inside the content area.
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
  const navigate = useNavigate();
  const currentKey = projectKeyFromPath(pathname);
  const me = useQuery(meQuery());
  const projects = useQuery(projectsQuery());
  const signOut = useSignOut();
  const theme = useThemeChoice();
  const onDashboard = pathname === DASHBOARD_HREF;
  // The dashboard spans every project: C there starts with the project picker instead of a guess.
  useShellHotkeys(currentKey, onDashboard ? { pickProject: true } : undefined);
  useGoToHotkeys({
    d: () => void navigate({ to: DASHBOARD_HREF }),
    m: () => void navigate({ to: MY_TASKS_HREF }),
  });
  const queueCount = useDashboardRailCount();
  useRefreshDashboardAfterEdits();

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
            {
              id: 'dashboard',
              label: 'Dashboard',
              href: DASHBOARD_HREF,
              isCurrent: onDashboard,
              count: queueCount,
              countLabel: railCountLabel,
            },
            { id: 'my-tasks', label: 'My tasks', href: MY_TASKS_HREF, isCurrent: pathname === MY_TASKS_HREF },
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
