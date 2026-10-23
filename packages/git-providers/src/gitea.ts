// Gitea and Forgejo, API v1. Checked against the Forgejo 17 swagger (codeberg.org/swagger.v1.json)
// and its source (services/repository/files/tree.go).
//
// Tree listings are paged with page and per_page; the server caps per_page at
// [api] DEFAULT_GIT_TREES_PER_PAGE (1000 by default). Forgejo sets `truncated` to true on every page
// whenever the tree has more entries than one page holds, the last page included, so the loop
// follows total_count and stops at an empty page instead of trusting `truncated`.

import { GitNotFound, GitUnauthorized, GitUnexpected } from './errors';
import { type FetchTree, listTreeByWalk, type RawTreeEntry, rawEntry, readFileByWalk } from './git-trees';
import { asArray, asRecord, decodeBase64, encodeSegments, type HttpClient, stringField } from './http';
import { repoSegments } from './paths';
import type { FileContent, GitProvider, RepositoryInfo, TreeEntry, Whoami } from './types';
import { verifyWebhook } from './webhooks';

const TREE_PAGE_SIZE = 1000;
const MAX_TREE_PAGES = 10_000;

export class GiteaProvider implements GitProvider {
  readonly provider = 'gitea' as const;

  constructor(
    readonly host: string,
    readonly apiBaseUrl: string,
    readonly webBaseUrl: string,
    private readonly http: HttpClient,
  ) {}

  private repo(path: string): string {
    const [owner, name] = repoSegments(path, false) as [string, string];
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }

  async whoami(): Promise<Whoami> {
    const { data } = await this.http.getJson(this.http.url('/user'));
    const login = stringField(asRecord(data, 'user'), 'login', 'the user');
    try {
      const { response } = await this.http.getJson(this.http.url('/user/repos', { limit: 1 }));
      const total = Number(response.headers.get('x-total-count'));
      return Number.isFinite(total) && response.headers.has('x-total-count')
        ? { login, repoCount: total }
        : { login };
    } catch (error) {
      // A token scoped without repository access still identifies its user.
      if (error instanceof GitUnauthorized || error instanceof GitNotFound) return { login };
      throw error;
    }
  }

  async getRepository(path: string): Promise<RepositoryInfo> {
    const { data } = await this.http.getJson(this.http.url(this.repo(path)));
    const repo = asRecord(data, 'repository');
    return {
      defaultBranch: stringField(repo, 'default_branch', 'the repository'),
      webUrl: stringField(repo, 'html_url', 'the repository'),
    };
  }

  async getBranchHead(path: string, branch: string): Promise<string> {
    const { data } = await this.http.getJson(
      this.http.url(`${this.repo(path)}/branches/${encodeSegments(branch)}`),
    );
    return stringField(asRecord(asRecord(data, 'branch').commit, 'branch commit'), 'id', 'the branch commit');
  }

  private fetchTree(path: string): FetchTree {
    return async (sha, recursive) => {
      const entries: RawTreeEntry[] = [];
      for (let page = 1; page <= MAX_TREE_PAGES; page++) {
        const { data } = await this.http.getJson(
          this.http.url(`${this.repo(path)}/git/trees/${encodeURIComponent(sha)}`, {
            recursive: recursive ? true : undefined,
            page,
            per_page: TREE_PAGE_SIZE,
          }),
        );
        const tree = asRecord(data, 'tree');
        // An empty tree comes back with "tree": null.
        const pageEntries = tree.tree === null || tree.tree === undefined ? [] : asArray(tree.tree, 'tree');
        entries.push(...pageEntries.map(rawEntry));
        const total = tree.total_count;
        const done =
          pageEntries.length === 0 ||
          (typeof total === 'number' ? entries.length >= total : tree.truncated !== true);
        if (done) return { entries, truncated: false };
      }
      throw new GitUnexpected('The provider kept sending tree pages.');
    };
  }

  listTree(path: string, commit: string, folder: string): Promise<TreeEntry[]> {
    return listTreeByWalk(this.fetchTree(path), commit, folder);
  }

  async readBlob(path: string, blobSha: string): Promise<string> {
    const { data } = await this.http.getJson(
      this.http.url(`${this.repo(path)}/git/blobs/${encodeURIComponent(blobSha)}`),
    );
    const blob = asRecord(data, 'blob');
    return decodeBase64(typeof blob.content === 'string' ? blob.content : '');
  }

  readFile(path: string, ref: string, filePath: string): Promise<FileContent | null> {
    return readFileByWalk(this.fetchTree(path), (sha) => this.readBlob(path, sha), ref, filePath);
  }

  fileUrl(path: string, branch: string, filePath: string): string {
    return `${this.webBaseUrl}/${repoSegments(path, false).join('/')}/src/branch/${encodeSegments(branch)}/${encodeSegments(filePath)}`;
  }

  verifyWebhook: GitProvider['verifyWebhook'] = (headers, rawBody, secret) =>
    verifyWebhook('gitea', headers, rawBody, secret);
}
