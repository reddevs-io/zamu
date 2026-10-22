import type { ProjectWithCounts } from '@pm/contracts';

type Sortable = Pick<ProjectWithCounts, 'key' | 'lastActivityAt'>;

/** Most recently updated first (latest of the project and its tasks); key breaks ties. */
export function byLastActivity<T extends Sortable>(projects: readonly T[]): T[] {
  return [...projects].sort(
    (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) || a.key.localeCompare(b.key),
  );
}

/** Key of the most recently updated project, or undefined when there are none. */
export function latestProjectKey(projects: readonly Sortable[]): string | undefined {
  return byLastActivity(projects)[0]?.key;
}

/** Case-insensitive match on key, name and description. */
export function filterProjects<T extends Pick<ProjectWithCounts, 'key' | 'name' | 'description'>>(
  projects: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...projects];
  return projects.filter((project) =>
    [project.key, project.name, project.description ?? ''].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
}
