import { cycleLengthDays, type ProjectWithCounts } from '@pm/contracts';
import { CycleGlyph, MilestoneGlyph, type ViewTab } from '~/ui';

// Tabs of the project header: Tasks always, Milestones and Cycles when the project uses them.

export type ProjectView = 'tasks' | 'milestones' | 'cycles';

export type ProjectTabsInput = Pick<
  ProjectWithCounts,
  'key' | 'usesMilestones' | 'usesCycles' | 'currentCycle'
> & { openCount?: number };

/** Page of a project view: /p/PAY, /p/PAY/milestones, /p/PAY/cycles. */
export function projectViewHref(projectKey: string, view: ProjectView): string {
  const base = `/p/${encodeURIComponent(projectKey)}`;
  return view === 'tasks' ? base : `${base}/${view}`;
}

/** "C12 · 3d left" for the Cycles tab, or undefined without a current cycle. */
export function cycleNote(currentCycle: ProjectTabsInput['currentCycle']): string | undefined {
  if (!currentCycle) return undefined;
  return `C${currentCycle.number} · ${currentCycle.daysLeft}d left`;
}

/** Share of the current cycle's days already gone, 0 to 1 (the pie of the cycle glyph). */
export function cycleElapsed(currentCycle: NonNullable<ProjectTabsInput['currentCycle']>): number {
  const length = cycleLengthDays(currentCycle.startsOn, currentCycle.endsOn);
  if (length <= 0) return 0;
  return Math.max(0, Math.min(1, (length - currentCycle.daysLeft) / length));
}

/**
 * The header tabs. Empty when the project uses neither milestones nor cycles: the header then shows
 * no tab row at all.
 */
export function projectTabs(project: ProjectTabsInput, milestoneCount?: number): ViewTab[] {
  if (!project.usesMilestones && !project.usesCycles) return [];
  const tabs: ViewTab[] = [
    {
      id: 'tasks',
      label: 'Tasks',
      href: projectViewHref(project.key, 'tasks'),
      ...(project.openCount != null ? { count: project.openCount } : {}),
    },
  ];
  if (project.usesMilestones) {
    tabs.push({
      id: 'milestones',
      label: 'Milestones',
      href: projectViewHref(project.key, 'milestones'),
      glyph: <MilestoneGlyph />,
      ...(milestoneCount != null ? { count: milestoneCount } : {}),
    });
  }
  if (project.usesCycles) {
    const current = project.currentCycle;
    const note = cycleNote(current);
    tabs.push({
      id: 'cycles',
      label: 'Cycles',
      href: projectViewHref(project.key, 'cycles'),
      glyph: current ? <CycleGlyph state="progress" progress={cycleElapsed(current)} /> : <CycleGlyph />,
      ...(note ? { note } : {}),
    });
  }
  return tabs;
}
