import { type GetHomeInput, HOME_TABS, type HomeTab, ProjectKey } from '@pm/contracts';
import { parseTaskFilter, type TaskFilter, taskFilterSearch } from '~/features/views';

// URL state of Home (/): ?tab=everyone&project=PAY,WEB&label=backend&priority=urgent,high
// Mine is the default and leaves no tab param. Labels are names: Home merges labels with the same name
// across projects. The M4 dashboard's ?scope=everyone still reads as the Everyone tab.

export interface HomeSearch {
  /** Unset means Mine. */
  tab?: Exclude<HomeTab, 'mine'>;
  /** Project keys, comma separated. */
  project?: string;
  /** Label names, comma separated. */
  label?: string;
  /** Priorities, comma separated. */
  priority?: string;
}

/** The filter Home applies: project keys, label names and priorities. */
export interface HomeFilter extends Pick<TaskFilter, 'label' | 'priority'> {
  project?: string[];
}

const MAX_PROJECTS = 50;

function projectList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const key = item.trim().toUpperCase();
    if (ProjectKey.safeParse(key).success && !keys.includes(key)) keys.push(key);
  }
  return keys.length ? keys.slice(0, MAX_PROJECTS) : undefined;
}

function tabOf(value: unknown): HomeSearch['tab'] {
  return value === 'everyone' || value === 'agents' ? value : undefined;
}

/** validateSearch for /. Drops anything it does not understand. */
export function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  const result: HomeSearch = {};
  // ?scope=everyone is the M4 dashboard's link to the same view.
  const tab = tabOf(search.tab) ?? (search.scope === 'everyone' ? 'everyone' : undefined);
  if (tab) result.tab = tab;
  const filter = homeFilterOf(search);
  return { ...result, ...homeFilterSearch(filter) };
}

/** The tab a search shows. */
export function homeTabOf(search: Pick<HomeSearch, 'tab'>): HomeTab {
  return search.tab && (HOME_TABS as readonly string[]).includes(search.tab) ? search.tab : 'mine';
}

/** The filter in a search (validated or raw). */
export function homeFilterOf(search: Record<string, unknown>): HomeFilter {
  const { label, priority } = parseTaskFilter(search, { labels: 'name' });
  const project = projectList(search.project);
  return {
    ...(project ? { project } : {}),
    ...(label ? { label } : {}),
    ...(priority ? { priority } : {}),
  };
}

/** The filter as search params; unset fields are undefined, so navigate() drops them. */
export function homeFilterSearch(filter: HomeFilter): Pick<HomeSearch, 'project' | 'label' | 'priority'> {
  const { label, priority } = taskFilterSearch(filter);
  const out: Pick<HomeSearch, 'project' | 'label' | 'priority'> = {};
  if (filter.project?.length) out.project = filter.project.join(',');
  if (typeof label === 'string') out.label = label;
  if (typeof priority === 'string') out.priority = priority;
  return out;
}

/** True when any Home filter is set. */
export function hasHomeFilter(filter: HomeFilter): boolean {
  return Boolean(filter.project?.length || filter.label?.length || filter.priority?.length);
}

/** home.get input of a tab and filter. Mine and an empty filter send nothing extra. */
export function homeInput(tab: HomeTab, filter: HomeFilter): GetHomeInput {
  return {
    tab,
    ...(filter.project?.length ? { project: [...filter.project] } : {}),
    ...(filter.label?.length ? { label: [...filter.label] } : {}),
    ...(filter.priority?.length ? { priority: [...filter.priority] } : {}),
  };
}
