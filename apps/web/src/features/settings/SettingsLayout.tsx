// Settings area: the 220px settings nav and the current settings page beside it. Sits in the content
// area right of the app rail: Members, API keys (admins) and Git connections for the workspace; Your
// API keys and Appearance for you.
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SettingsNav, type SettingsNavSection } from '~/ui';
import { isAdminRole } from './format';
import { meQuery } from './queries';

export const SETTINGS_PATHS = {
  members: '/settings/members',
  apiKeys: '/settings/api-keys',
  connections: '/settings/connections',
  myKeys: '/settings/my-keys',
  appearance: '/settings/appearance',
} as const;

export function settingsSections(pathname: string, isAdmin: boolean): SettingsNavSection[] {
  const item = (id: string, label: string, href: string) => ({
    id,
    label,
    href,
    isCurrent: pathname === href || pathname.startsWith(`${href}/`),
  });
  return [
    {
      label: 'Workspace',
      items: [
        item('members', 'Members', SETTINGS_PATHS.members),
        ...(isAdmin ? [item('api-keys', 'API keys', SETTINGS_PATHS.apiKeys)] : []),
        item('connections', 'Git connections', SETTINGS_PATHS.connections),
      ],
    },
    {
      label: 'You',
      items: [
        item('my-keys', 'Your API keys', SETTINGS_PATHS.myKeys),
        item('appearance', 'Appearance', SETTINGS_PATHS.appearance),
      ],
    },
  ];
}

export function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: me } = useQuery(meQuery());
  return (
    // h-dvh keeps the layout full height on its own; inside the app shell, flex-1 sizes it instead.
    <div className="flex h-dvh min-h-0 min-w-0 flex-1 bg-bg text-fg">
      <SettingsNav sections={settingsSections(pathname, isAdminRole(me?.role))} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
