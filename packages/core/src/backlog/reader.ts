// Reads a Backlog.md folder through a git provider: finds the folder, lists it at one commit,
// reads the config and downloads only the files whose blob changed since the last read. Parsing
// goes through @zamu/backlog-md; the result feeds the planner (./plan).
import {
  type BacklogConfig,
  classifyPath,
  defaultConfig,
  parseConfig,
  parseMilestone,
  parseRootConfig,
  parseTask,
} from '@zamu/backlog-md';
// Not re-exported by the package index.
import { ROOT_CONFIG_PATH } from '@zamu/backlog-md/folder';
import type { BacklogConfigSummary, BacklogFolderCount, BacklogFolderSource } from '@zamu/contracts';
import { parseRepositoryUrl } from '@zamu/contracts';
import type { GitProvider, TreeEntry } from '@zamu/git-providers';
import type { ContentFileKind, ExistingFile, ExistingMilestone, ExistingTask, PlanFile } from './plan';
import { readStoredBlock } from './plan';

/** Default folders, in the order Backlog.md looks for them. */
export const DEFAULT_FOLDERS = ['backlog', '.backlog'] as const;

/** Parallel blob downloads per read. */
const DOWNLOAD_CONCURRENCY = 8;

/** The repository of a project as the provider addresses it. */
export interface RepositoryRef {
  /** owner/name (GitLab: the full namespace path). */
  path: string;
  /** host/owner/name. */
  short: string;
  host: string;
  webUrl: string;
}

export function repositoryRef(repository: string | null): RepositoryRef | null {
  const parsed = repository ? parseRepositoryUrl(repository) : null;
  return parsed ? { path: parsed.path, short: parsed.short, host: parsed.host, webUrl: parsed.webUrl } : null;
}

/** Web page of a commit on the provider. */
export function commitUrl(
  provider: string | null,
  repository: RepositoryRef | null,
  commit: string,
): string | null {
  if (!repository) return null;
  switch (provider) {
    case 'gitlab':
      return `${repository.webUrl}/-/commit/${commit}`;
    case 'github':
    case 'gitea':
      return `${repository.webUrl}/commit/${commit}`;
    default:
      return null;
  }
}

function trimFolder(folder: string): string {
  return folder.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
}

export interface FolderLocation {
  /** The commit the folder was located at. */
  commit: string;
  /** Null when no Backlog.md folder was found. */
  folder: string | null;
  source: BacklogFolderSource | null;
  /** Every file under the folder (empty when none was found). */
  tree: TreeEntry[];
  /** The root backlog.config.yml when it names the project: Backlog.md reads its whole config from there. */
  rootConfig: { path: string; blobSha: string; text: string } | null;
}

/**
 * Finds the folder at `commit`: the override, else backlog_directory in a root backlog.config.yml,
 * else backlog/, else .backlog/.
 */
export async function locateFolder(
  provider: GitProvider,
  repoPath: string,
  commit: string,
  override: string | null,
): Promise<FolderLocation> {
  const root = await provider.readFile(repoPath, commit, ROOT_CONFIG_PATH);
  const rootParsed = root ? parseRootConfig(root.content) : null;
  const rootConfig =
    root && rootParsed?.ok && rootParsed.value.projectName
      ? { path: ROOT_CONFIG_PATH, blobSha: root.blobSha, text: root.content }
      : null;

  const candidates: [string, BacklogFolderSource][] = [];
  if (override) candidates.push([trimFolder(override), 'override']);
  else {
    const configured = rootParsed?.ok ? rootParsed.value.backlogDirectory : null;
    if (configured) candidates.push([trimFolder(configured), 'config']);
    for (const folder of DEFAULT_FOLDERS) candidates.push([folder, 'default']);
  }
  for (const [folder, source] of candidates) {
    const tree = await provider.listTree(repoPath, commit, folder);
    if (tree.length > 0) return { commit, folder, source, tree, rootConfig };
    // An override or a configured folder is final: say it is empty rather than guess another one.
    if (source !== 'default') return { commit, folder: null, source, tree: [], rootConfig };
  }
  return { commit, folder: null, source: null, tree: [], rootConfig };
}

/** File counts per subfolder of the Backlog.md folder; docs/, decisions/ and the like are marked ignored. */
export function folderCounts(folder: string, tree: TreeEntry[], taskPrefix?: string): BacklogFolderCount[] {
  const counts = new Map<string, { count: number; used: number }>();
  for (const entry of tree) {
    const relative = entry.path.startsWith(`${folder}/`) ? entry.path.slice(folder.length + 1) : entry.path;
    const directory = relative.includes('/') ? `${relative.slice(0, relative.lastIndexOf('/'))}/` : '';
    if (directory === '') continue;
    const kind = classifyPath(entry.path, folder, taskPrefix ? { taskPrefix } : {});
    const item = counts.get(directory) ?? { count: 0, used: 0 };
    item.count += 1;
    if (kind !== 'ignored') item.used += 1;
    counts.set(directory, item);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, { count, used }]) => ({ path, count, ignored: used === 0 }));
}

/** Rebuilds a parser config from the summary stored on the source (when config.yml did not change). */
export function configFromSummary(summary: BacklogConfigSummary): BacklogConfig {
  return {
    ...defaultConfig(),
    projectName: summary.projectName,
    taskPrefix: summary.taskPrefix,
    statuses: summary.statuses,
    defaultStatus: summary.defaultStatus,
    priorities: summary.priorities,
    labels: summary.labels,
    legacyMilestones: summary.milestones,
    zeroPaddedIds: summary.zeroPaddedIds,
  };
}

/** What the last successful read left, for incremental reads. Omit for a full read (setup, preview). */
export interface PreviousRead {
  folder: string | null;
  config: BacklogConfigSummary | null;
  files: ExistingFile[];
  tasks: ExistingTask[];
  milestones: ExistingMilestone[];
}

export interface FolderRead {
  folder: string;
  config: BacklogConfig;
  /** Why the config did not parse; the refresh fails then and nothing is written. */
  configError: string | null;
  configFile: { path: string; blobSha: string } | null;
  files: PlanFile[];
  /** Blobs downloaded by this read (config included). */
  downloads: number;
  /** True when every file was downloaded (no previous read, the folder or config changed). */
  full: boolean;
}

/** Runs `work` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Reads the folder found by locateFolder. With `previous`, files whose blob is unchanged and whose
 * row still exists are not downloaded (the planner takes them from their rows); a changed folder
 * or config reads everything again.
 */
export async function readFolder(
  provider: GitProvider,
  repoPath: string,
  location: FolderLocation & { folder: string },
  previous: PreviousRead | null,
): Promise<FolderRead> {
  const { folder, tree } = location;
  let downloads = 0;
  // Filled by the batch read below on providers that have one; anything missing is read alone.
  let batched = new Map<string, string>();
  const download = async (blobSha: string) => {
    downloads += 1;
    return batched.get(blobSha) ?? provider.readBlob(repoPath, blobSha);
  };

  // Config: the root file when it names the project, else <folder>/config.yml (or .yaml).
  const configEntries = tree.filter((entry) => classifyPath(entry.path, folder) === 'config');
  const configEntry =
    configEntries.find((entry) => entry.path.endsWith('config.yml')) ?? configEntries[0] ?? null;
  const configFile = location.rootConfig
    ? { path: location.rootConfig.path, blobSha: location.rootConfig.blobSha }
    : configEntry
      ? { path: configEntry.path, blobSha: configEntry.blobSha }
      : null;
  const previousConfigRow = previous?.files.find((file) => file.kind === 'config') ?? null;
  const full =
    !previous ||
    previous.folder !== folder ||
    !previous.config ||
    (previousConfigRow?.path ?? null) !== (configFile?.path ?? null) ||
    (previousConfigRow?.blobSha ?? null) !== (configFile?.blobSha ?? null);

  let config: BacklogConfig = defaultConfig();
  let configError: string | null = null;
  if (location.rootConfig) {
    const parsed = parseConfig(location.rootConfig.text);
    if (parsed.ok) config = parsed.value;
    else configError = `${location.rootConfig.path}: ${parsed.error.message}`;
  } else if (configEntry) {
    if (!full && previous?.config) config = configFromSummary(previous.config);
    else {
      const parsed = parseConfig(await download(configEntry.blobSha));
      if (parsed.ok) config = parsed.value;
      else configError = `${configEntry.path}: ${parsed.error.message}`;
    }
  }
  if (configError) return { folder, config, configError, configFile, files: [], downloads, full };

  const previousByPath = new Map((previous?.files ?? []).map((file) => [file.path, file]));
  const taskIds = new Map((previous?.tasks ?? []).map((task) => [task.id, task]));
  const milestoneIds = new Set((previous?.milestones ?? []).map((row) => row.id));
  const content: { entry: TreeEntry; kind: ContentFileKind }[] = [];
  for (const entry of tree) {
    const kind = classifyPath(entry.path, folder, { taskPrefix: config.taskPrefix });
    if (kind === 'ignored' || kind === 'config') continue;
    content.push({ entry, kind });
  }
  content.sort((a, b) => (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0));

  const isUnchanged = (entry: TreeEntry, kind: ContentFileKind): ExistingFile | null => {
    if (full) return null;
    const row = previousByPath.get(entry.path);
    if (!row || row.blobSha !== entry.blobSha || row.kind !== kind || row.error !== null) return null;
    if (kind === 'milestone' || kind === 'archived_milestone') {
      return row.milestoneId && milestoneIds.has(row.milestoneId) ? row : null;
    }
    const task = row.taskId ? taskIds.get(row.taskId) : undefined;
    return task?.backlogId && readStoredBlock(task.backlogData) ? row : null;
  };

  if (provider.readBlobs) {
    const needed = content
      .filter(({ entry, kind }) => !isUnchanged(entry, kind))
      .map(({ entry }) => ({ path: entry.path, blobSha: entry.blobSha }));
    if (needed.length > 0) batched = await provider.readBlobs(repoPath, location.commit, needed);
  }
  const files = await mapLimit(content, DOWNLOAD_CONCURRENCY, async ({ entry, kind }): Promise<PlanFile> => {
    const unchanged = isUnchanged(entry, kind);
    if (unchanged) return { path: entry.path, blobSha: entry.blobSha, kind, unchanged };
    const text = await download(entry.blobSha);
    if (kind === 'milestone' || kind === 'archived_milestone') {
      return { path: entry.path, blobSha: entry.blobSha, kind, read: parseMilestone(entry.path, text) };
    }
    return { path: entry.path, blobSha: entry.blobSha, kind, read: parseTask(entry.path, text, config) };
  });
  return { folder, config, configError: null, configFile, files, downloads, full };
}
