// Tree walking shared by GitHub and Gitea/Forgejo, whose "get a tree" endpoints take a tree (or
// commit) hash and return entries with paths relative to that tree.

import { GitUnexpected } from './errors';
import { isRegularFileMode, normalizeFolder, splitFilePath } from './paths';
import type { FileContent, TreeEntry } from './types';

export interface RawTreeEntry {
  /** Path relative to the listed tree. */
  path: string;
  type: string;
  mode: string;
  sha: string;
  size: number | null;
}

export interface TreeListing {
  entries: RawTreeEntry[];
  /** True when the provider left entries out (GitHub's recursive limit). */
  truncated: boolean;
}

/** Lists one tree by hash (or commit hash / ref for the root), recursively or one level. */
export type FetchTree = (sha: string, recursive: boolean) => Promise<TreeListing>;

const tooLarge = () =>
  new GitUnexpected('A folder in this repository has too many entries for the provider to list.');

function blobs(entries: RawTreeEntry[], prefix: string): TreeEntry[] {
  return entries
    .filter((entry) => entry.type === 'blob' && isRegularFileMode(entry.mode))
    .map((entry) => ({ path: `${prefix}${entry.path}`, blobSha: entry.sha, size: entry.size }));
}

/** Hash of the tree at `folder` below `rootSha`, walking one level per segment; null when missing. */
async function findTree(fetchTree: FetchTree, rootSha: string, folder: string): Promise<string | null> {
  let sha = rootSha;
  if (!folder) return sha;
  for (const segment of folder.split('/')) {
    const listing = await fetchTree(sha, false);
    const entry = listing.entries.find((candidate) => candidate.path === segment);
    if (!entry) {
      if (listing.truncated) throw tooLarge();
      return null;
    }
    if (entry.type !== 'tree') return null;
    sha = entry.sha;
  }
  return sha;
}

export async function listTreeByWalk(
  fetchTree: FetchTree,
  commit: string,
  folder: string,
): Promise<TreeEntry[]> {
  const normalized = normalizeFolder(folder);
  const folderSha = await findTree(fetchTree, commit, normalized);
  if (folderSha === null) return [];
  const prefix = normalized ? `${normalized}/` : '';

  const recursive = await fetchTree(folderSha, true);
  if (!recursive.truncated) return blobs(recursive.entries, prefix);

  // Too big for one recursive call: list one tree at a time, breadth first.
  const result: TreeEntry[] = [];
  const queue: { sha: string; prefix: string }[] = [{ sha: folderSha, prefix }];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const listing = await fetchTree(next.sha, false);
    if (listing.truncated) throw tooLarge();
    result.push(...blobs(listing.entries, next.prefix));
    for (const entry of listing.entries) {
      if (entry.type === 'tree') queue.push({ sha: entry.sha, prefix: `${next.prefix}${entry.path}/` });
    }
  }
  return result;
}

export async function readFileByWalk(
  fetchTree: FetchTree,
  readBlob: (sha: string) => Promise<string>,
  ref: string,
  filePath: string,
): Promise<FileContent | null> {
  const { parent, name } = splitFilePath(filePath);
  if (!name) return null;
  const parentSha = await findTree(fetchTree, ref, parent);
  if (parentSha === null) return null;
  const listing = await fetchTree(parentSha, false);
  const entry = listing.entries.find((candidate) => candidate.path === name);
  if (!entry) {
    if (listing.truncated) throw tooLarge();
    return null;
  }
  if (entry.type !== 'blob' || !isRegularFileMode(entry.mode)) return null;
  return { content: await readBlob(entry.sha), blobSha: entry.sha };
}

export function rawEntry(value: unknown): RawTreeEntry {
  if (!value || typeof value !== 'object')
    throw new GitUnexpected('The provider sent an unexpected tree entry.');
  const record = value as Record<string, unknown>;
  const { path, type, mode, sha, size } = record;
  if (typeof path !== 'string' || typeof type !== 'string' || typeof sha !== 'string') {
    throw new GitUnexpected('The provider sent an unexpected tree entry.');
  }
  return {
    path,
    type,
    mode: typeof mode === 'string' ? mode : '',
    sha,
    size: typeof size === 'number' ? size : null,
  };
}
