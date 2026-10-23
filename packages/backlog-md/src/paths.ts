import type { BacklogFileKind } from './types';

export interface ClassifyOptions {
  /**
   * The config's task prefix. When given, task and archived files must start with "<prefix>-"
   * (any case), as Backlog.md only lists those. When omitted, any "<letters>-<number>" name counts.
   */
  taskPrefix?: string;
}

function trimSlashes(value: string): string {
  return value.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

function startsWithId(fileName: string, prefix: string | undefined): boolean {
  const letters = prefix?.replace(/[^A-Za-z]/g, '');
  const pattern = letters ? new RegExp(`^${letters}-\\d`, 'i') : /^[A-Za-z]+-\d/;
  return pattern.test(fileName);
}

/**
 * What a repository path is to the Backlog.md folder `folder` (for example "backlog"). Only direct
 * children of each Backlog.md directory count, like Backlog.md's own listing; readme.md files, docs/,
 * decisions/, archive/drafts/ and everything else are ignored. Legacy completed/ holds archived tasks.
 */
export function classifyPath(path: string, folder: string, options: ClassifyOptions = {}): BacklogFileKind {
  const root = trimSlashes(folder);
  const full = trimSlashes(path);
  const relative = root === '' ? full : full.startsWith(`${root}/`) ? full.slice(root.length + 1) : null;
  if (relative === null || relative === '') return 'ignored';

  const parts = relative.split('/');
  const fileName = parts.at(-1) ?? '';
  const directory = parts.slice(0, -1).join('/');

  if (directory === '' && (fileName === 'config.yml' || fileName === 'config.yaml')) return 'config';
  if (!fileName.endsWith('.md') || fileName.toLowerCase() === 'readme.md') return 'ignored';

  switch (directory) {
    case 'tasks':
      return startsWithId(fileName, options.taskPrefix) ? 'task' : 'ignored';
    case 'archive/tasks':
    case 'completed':
      return startsWithId(fileName, options.taskPrefix) ? 'archived' : 'ignored';
    case 'drafts':
      return startsWithId(fileName, 'draft') ? 'draft' : 'ignored';
    case 'milestones':
      return /^m-\d/i.test(fileName) ? 'milestone' : 'ignored';
    case 'archive/milestones':
      return /^m-\d/i.test(fileName) ? 'archived_milestone' : 'ignored';
    default:
      return 'ignored';
  }
}
