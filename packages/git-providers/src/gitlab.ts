// GitLab (gitlab.com and self-managed), REST API v4.
// Docs: https://docs.gitlab.com/api/repositories/ (tree with keyset pagination, raw blobs),
// /api/branches/, /api/projects/, /api/rest/ (URL-encoded namespaced paths, Link headers).
//
// The tree endpoint answers 404 "invalid revision or path" for a folder that does not exist, the
// same status as for a missing project. To tell them apart, listTree first checks the folder in its
// parent's listing; the recursive listing then only runs on a folder known to exist.

import { GitNotFound, GitUnauthorized, GitUnexpected } from './errors';
import {
  asArray,
  asRecord,
  decodeUtf8,
  encodeSegments,
  type HttpClient,
  nextLink,
  stringField,
} from './http';
import { isRegularFileMode, normalizeFolder, repoSegments, splitFilePath } from './paths';
import type { FileContent, GitProvider, RepositoryInfo, TreeEntry, Whoami } from './types';
import { verifyWebhook } from './webhooks';

const PAGE_SIZE = 100;
const MAX_PAGES = 10_000;

interface GitLabEntry {
  id: string;
  name: string;
  type: string;
  path: string;
  mode: string;
}

function gitLabEntry(value: unknown): GitLabEntry {
  const record = asRecord(value, 'tree entry');
  return {
    id: stringField(record, 'id', 'a tree entry'),
    name: stringField(record, 'name', 'a tree entry'),
    type: stringField(record, 'type', 'a tree entry'),
    path: stringField(record, 'path', 'a tree entry'),
    mode: typeof record.mode === 'string' ? record.mode : '',
  };
}

export class GitLabProvider implements GitProvider {
  readonly provider = 'gitlab' as const;

  constructor(
    readonly host: string,
    readonly apiBaseUrl: string,
    readonly webBaseUrl: string,
    private readonly http: HttpClient,
  ) {}

  private project(path: string): string {
    return `/projects/${encodeURIComponent(repoSegments(path, true).join('/'))}`;
  }

  async whoami(): Promise<Whoami> {
    const { data } = await this.http.getJson(this.http.url('/user'));
    const login = stringField(asRecord(data, 'user'), 'username', 'the user');
    // X-Total is left out above 10,000 results and on some gitlab.com endpoints; the count is optional.
    try {
      const { response } = await this.http.getJson(
        this.http.url('/projects', { membership: true, simple: true, per_page: 1 }),
      );
      const total = response.headers.get('x-total');
      return total !== null && /^\d+$/.test(total) ? { login, repoCount: Number(total) } : { login };
    } catch (error) {
      // A token limited to read_user still identifies its user.
      if (error instanceof GitUnauthorized || error instanceof GitNotFound) return { login };
      throw error;
    }
  }

  async getRepository(path: string): Promise<RepositoryInfo> {
    const { data } = await this.http.getJson(this.http.url(this.project(path)));
    const project = asRecord(data, 'project');
    if (project.default_branch === null) {
      // GitLab reports no default branch until the first push.
      throw new GitNotFound('The repository is empty: it has no default branch yet.', {
        code: 'empty_repository',
      });
    }
    return {
      defaultBranch: stringField(project, 'default_branch', 'the project'),
      webUrl: stringField(project, 'web_url', 'the project'),
    };
  }

  async getBranchHead(path: string, branch: string): Promise<string> {
    const { data } = await this.http.getJson(
      this.http.url(`${this.project(path)}/repository/branches/${encodeURIComponent(branch)}`),
    );
    return stringField(asRecord(asRecord(data, 'branch').commit, 'branch commit'), 'id', 'the branch commit');
  }

  /** One folder level (or everything below it), all pages, following the Link header. */
  private async listLevel(
    path: string,
    ref: string,
    folder: string,
    recursive: boolean,
  ): Promise<GitLabEntry[]> {
    const entries: GitLabEntry[] = [];
    let url: URL | null = this.http.url(`${this.project(path)}/repository/tree`, {
      ref,
      path: folder || undefined,
      recursive: recursive || undefined,
      per_page: PAGE_SIZE,
      pagination: 'keyset',
    });
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const { data, response } = await this.http.getJson(url);
      entries.push(...asArray(data, 'tree').map(gitLabEntry));
      const next = nextLink(response.headers.get('link'));
      url = next ? this.http.followLink(next) : null;
    }
    if (url) throw new GitUnexpected('The provider kept sending tree pages.');
    return entries;
  }

  /** Direct children of `folder`, or null when the folder does not exist at `ref`. */
  private async childrenOf(path: string, ref: string, folder: string): Promise<GitLabEntry[] | null> {
    let listing = await this.listLevel(path, ref, '', false);
    let current = '';
    for (const segment of folder ? folder.split('/') : []) {
      const entry = listing.find((candidate) => candidate.name === segment);
      if (entry?.type !== 'tree') return null;
      current = current ? `${current}/${segment}` : segment;
      listing = await this.listLevel(path, ref, current, false);
    }
    return listing;
  }

  async listTree(path: string, commit: string, folder: string): Promise<TreeEntry[]> {
    const normalized = normalizeFolder(folder);
    if (normalized) {
      const { parent, name } = splitFilePath(normalized);
      const siblings = await this.childrenOf(path, commit, parent);
      if (!siblings?.some((entry) => entry.name === name && entry.type === 'tree')) return [];
    }
    const entries = await this.listLevel(path, commit, normalized, true);
    return entries
      .filter((entry) => entry.type === 'blob' && isRegularFileMode(entry.mode))
      .map((entry) => ({ path: entry.path, blobSha: entry.id, size: null }));
  }

  async readBlob(path: string, blobSha: string): Promise<string> {
    const bytes = await this.http.getBytes(
      this.http.url(`${this.project(path)}/repository/blobs/${encodeURIComponent(blobSha)}/raw`),
      '*/*',
    );
    return decodeUtf8(bytes);
  }

  async readFile(path: string, ref: string, filePath: string): Promise<FileContent | null> {
    const { parent, name } = splitFilePath(filePath);
    if (!name) return null;
    const siblings = await this.childrenOf(path, ref, parent);
    const entry = siblings?.find((candidate) => candidate.name === name);
    if (entry?.type !== 'blob' || !isRegularFileMode(entry.mode)) return null;
    return { content: await this.readBlob(path, entry.id), blobSha: entry.id };
  }

  fileUrl(path: string, branch: string, filePath: string): string {
    return `${this.webBaseUrl}/${repoSegments(path, true).join('/')}/-/blob/${encodeSegments(branch)}/${encodeSegments(filePath)}`;
  }

  verifyWebhook: GitProvider['verifyWebhook'] = (headers, rawBody, secret) =>
    verifyWebhook('gitlab', headers, rawBody, secret);
}
