import { defaultConfig, parseConfig, parseRootConfig } from './config';
import { legacyConfigMilestones, parseMilestone } from './milestone';
import { classifyPath } from './paths';
import { parseTask } from './task';
import type { BacklogConfig, BacklogMilestone, BacklogTask, ParseResult } from './types';

export interface FolderFile {
  /** Repository path, e.g. "backlog/tasks/back-1 - Title.md". */
  path: string;
  text: string;
}

export type ParsedFile =
  | { path: string; kind: 'task' | 'draft' | 'archived'; result: ParseResult<BacklogTask> }
  | { path: string; kind: 'milestone' | 'archived_milestone'; result: ParseResult<BacklogMilestone> };

export interface ParsedFolder {
  /**
   * The config file used: a root backlog.config.yml that names a project (Backlog.md then reads its
   * whole config from there), else <folder>/config.yml, else <folder>/config.yaml; null when none.
   */
  config: { path: string; result: ParseResult<BacklogConfig> } | null;
  /** The config the files were read with: the parsed one, or defaults when missing or broken. */
  effectiveConfig: BacklogConfig;
  /** Every task, draft, archived and milestone file, in path order. Ignored paths are left out. */
  files: ParsedFile[];
  /** Legacy config milestones, only when the folder has no milestone files at all. */
  legacyMilestones: BacklogMilestone[];
}

/** Repository-root config file Backlog.md checks before the folder's own config. */
export const ROOT_CONFIG_PATH = 'backlog.config.yml';

/**
 * Convenience over classifyPath, parseConfig, parseTask and parseMilestone for a whole folder held in
 * memory. Pure: the caller reads the files. Include the repository's backlog.config.yml in `files` when
 * it exists.
 */
export function parseBacklogFolder(files: FolderFile[], folder: string): ParsedFolder {
  const sorted = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const root = sorted.find((file) => file.path === ROOT_CONFIG_PATH);
  const rootConfig = root ? parseRootConfig(root.text) : null;
  const configs = sorted.filter((file) => classifyPath(file.path, folder) === 'config');
  const configFile =
    (rootConfig?.ok && rootConfig.value.projectName ? root : undefined) ??
    configs.find((file) => file.path.endsWith('config.yml')) ??
    configs[0];
  const configResult = configFile ? parseConfig(configFile.text) : null;
  const effectiveConfig = configResult?.ok ? configResult.value : defaultConfig();

  const parsed: ParsedFile[] = [];
  for (const file of sorted) {
    const kind = classifyPath(file.path, folder, { taskPrefix: effectiveConfig.taskPrefix });
    switch (kind) {
      case 'task':
      case 'draft':
      case 'archived':
        parsed.push({ path: file.path, kind, result: parseTask(file.path, file.text, effectiveConfig) });
        break;
      case 'milestone':
      case 'archived_milestone':
        parsed.push({ path: file.path, kind, result: parseMilestone(file.path, file.text) });
        break;
      default:
        break;
    }
  }

  const hasMilestoneFiles = parsed.some(
    (file) => file.kind === 'milestone' || file.kind === 'archived_milestone',
  );
  return {
    config: configFile && configResult ? { path: configFile.path, result: configResult } : null,
    effectiveConfig,
    files: parsed,
    legacyMilestones: hasMilestoneFiles ? [] : legacyConfigMilestones(effectiveConfig),
  };
}
