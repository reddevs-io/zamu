// Project settings frame (frames 2a to 2o): the project header with its tabs, a 200px section nav
// (General, Backlog.md with the source dot) and the current section.
import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { ProjectHeader, useProjectSummary } from '~/features/project-header';
import { cn, SourceStatusDot } from '~/ui';
import { sourceDot } from './format';

export type ProjectSettingsSection = 'general' | 'backlog';

/** /p/PAY/settings and /p/PAY/settings/backlog. */
export function projectSettingsHref(projectKey: string, section: ProjectSettingsSection = 'general'): string {
  const base = `/p/${encodeURIComponent(projectKey)}/settings`;
  return section === 'general' ? base : `${base}/backlog`;
}

export function ProjectSettingsLayout({ projectKey, children }: { projectKey: string; children: ReactNode }) {
  const project = useProjectSummary(projectKey);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section: ProjectSettingsSection = pathname.replace(/\/+$/, '').endsWith('/settings/backlog')
    ? 'backlog'
    : 'general';
  const backlog = project?.backlog ?? null;

  const item = (id: ProjectSettingsSection, label: string, trailing?: ReactNode) => {
    const current = section === id;
    return (
      <Link
        href={projectSettingsHref(projectKey, id)}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex h-[30px] items-center gap-2 px-3 outline-none focus-visible:focus-ring-inset',
          current
            ? 'bg-surface font-semibold text-fg shadow-[inset_2px_0_0_var(--accent)]'
            : 'text-muted hover:text-fg',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </Link>
    );
  };

  return (
    <section
      aria-label="Project settings"
      className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg"
    >
      <ProjectHeader
        projectKey={projectKey}
        current="settings"
        // The Backlog.md section binds ⇧R to its own Refresh now.
        refreshHotkey={section !== 'backlog'}
        subtitle={project ? (project.openCount ? `${project.openCount} open` : 'no tasks yet') : undefined}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-0.5 border-r border-line bg-band px-2.5 py-4"
        >
          {item('general', 'General')}
          {item(
            'backlog',
            'Backlog.md',
            backlog ? <SourceStatusDot state={sourceDot(backlog.state)} className="mr-1" /> : undefined,
          )}
        </nav>
        <div className="min-h-0 overflow-auto">
          <div className="flex max-w-[956px] flex-col gap-4 px-7 pt-5 pb-8">{children}</div>
        </div>
      </div>
    </section>
  );
}
