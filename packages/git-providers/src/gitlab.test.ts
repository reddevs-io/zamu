import { describe, expect, it } from 'vitest';
import { FIXTURE_TOKEN, loadFixture, replay } from '../test/replay';
import { createProvider } from './create';
import { GitNotFound, GitRateLimited, GitUnauthorized, GitUnreachable } from './errors';
import type { FetchFn } from './types';

const HEAD = 'a6fd50cecb4bbe630dfb03a621cbe2cedfef4aef';

function gitlab(fixture: string) {
  const server = replay(loadFixture('gitlab', fixture));
  const provider = createProvider({
    provider: 'gitlab',
    host: 'gitlab.com',
    token: FIXTURE_TOKEN,
    fetch: server.fetch,
  });
  return { provider, server };
}

describe('GitLab adapter', () => {
  it('derives the API base URL and sends the token as a bearer token', async () => {
    const { provider, server } = gitlab('whoami');
    expect(provider.apiBaseUrl).toBe('https://gitlab.com/api/v4');
    await expect(provider.whoami()).resolves.toEqual({ login: 'john_smith', repoCount: 12 });
    expect(server.calls.every((call) => call.headers.authorization === `Bearer ${FIXTURE_TOKEN}`)).toBe(true);
    expect(server.unused()).toEqual([]);
  });

  it('whoami still answers when the token cannot list projects', async () => {
    const fetch: FetchFn = async (input) =>
      String(input).endsWith('/user')
        ? Response.json({ username: 'reader' })
        : Response.json({ message: '403 Forbidden' }, { status: 403 });
    const provider = createProvider({ provider: 'gitlab', host: 'gitlab.com', token: FIXTURE_TOKEN, fetch });
    await expect(provider.whoami()).resolves.toEqual({ login: 'reader' });
  });

  it('reads the project with a URL-encoded path, and the branch head', async () => {
    const { provider, server } = gitlab('repository');
    await expect(provider.getRepository('gitlab-org/cli')).resolves.toEqual({
      defaultBranch: 'main',
      webUrl: 'https://gitlab.com/gitlab-org/cli',
    });
    await expect(provider.getBranchHead('gitlab-org/cli', 'main')).resolves.toBe(HEAD);
    expect(server.calls[0]?.url).toBe('https://gitlab.com/api/v4/projects/gitlab-org%2Fcli');
  });

  it('reports an empty project as not found', async () => {
    const { provider } = gitlab('repository-empty');
    await expect(provider.getRepository('acme/empty')).rejects.toMatchObject({
      kind: 'not_found',
      code: 'empty_repository',
    });
  });

  it('lists a folder over keyset pages, following the Link header', async () => {
    const { provider, server } = gitlab('tree');
    const entries = await provider.listTree('gitlab-org/cli', HEAD, 'scripts');
    expect(entries).toEqual([
      { path: 'scripts/bootstrap.sh', blobSha: '6fa64cadf880782844e1c06b89a552efc119532a', size: null },
      {
        path: 'scripts/changed-test-pkgs.sh',
        blobSha: '0eb453a67ec1f140ada18146d48c089cd72d17ec',
        size: null,
      },
      { path: 'scripts/changelog', blobSha: 'dfa6ce431acd893317971096b49b20558065b6e8', size: null },
      {
        path: 'scripts/check-go-version.sh',
        blobSha: 'd350a7e5fef032b49d98b541ce9a850ee1a15fd8',
        size: null,
      },
    ]);
    expect(server.calls).toHaveLength(4);
    expect(server.unused()).toEqual([]);
  });

  it('returns no entries for a missing folder without asking for it', async () => {
    const { provider, server } = gitlab('tree');
    await expect(provider.listTree('gitlab-org/cli', HEAD, 'backlog')).resolves.toEqual([]);
    expect(server.calls).toHaveLength(1);
  });

  it('walks nested folders of a subgroup project and keeps links on the configured origin', async () => {
    const { provider, server } = gitlab('tree-nested');
    const commit = '0000000000000000000000000000000000000001';
    const entries = await provider.listTree('group/sub/app', commit, 'docs/backlog');
    expect(entries.map((entry) => entry.path)).toEqual([
      'docs/backlog/config.yml',
      'docs/backlog/tasks/task-1 - One.md',
    ]);
    expect(
      server.calls.every((call) =>
        call.url.startsWith('https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp/'),
      ),
    ).toBe(true);
    expect(server.unused()).toEqual([]);
  });

  it('reads a raw blob as UTF-8', async () => {
    const { provider } = gitlab('blob');
    const text = await provider.readBlob('gitlab-org/cli', '0eb453a67ec1f140ada18146d48c089cd72d17ec');
    expect(text.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(text.length).toBeGreaterThan(2000);
  });

  it('reads one file at a ref, and null for a missing one', async () => {
    const { provider } = gitlab('read-file');
    await expect(provider.readFile('acme/app', 'main', 'backlog.config.yml')).resolves.toEqual({
      content: 'backlog_directory: planning\n',
      blobSha: '0000000000000000000000000000000000000014',
    });
    const again = gitlab('read-file');
    await expect(again.provider.readFile('acme/app', 'main', 'nope.yml')).resolves.toBeNull();
  });

  it('builds file links in the /-/blob form', () => {
    const { provider } = gitlab('whoami');
    expect(provider.fileUrl('group/sub/app', 'main', 'backlog/tasks/task-1 - A.md')).toBe(
      'https://gitlab.com/group/sub/app/-/blob/main/backlog/tasks/task-1%20-%20A.md',
    );
  });

  it('maps error statuses to typed errors', async () => {
    const { provider } = gitlab('errors');
    const caught = async (promise: Promise<unknown>) => promise.catch((error: unknown) => error);
    const unauthorized = await caught(provider.whoami());
    expect(unauthorized).toBeInstanceOf(GitUnauthorized);
    await expect(provider.getRepository('acme/missing')).rejects.toBeInstanceOf(GitNotFound);
    await expect(provider.getRepository('acme/forbidden')).rejects.toMatchObject({
      kind: 'unauthorized',
      code: 'forbidden',
    });
    const limited = await caught(provider.getRepository('acme/limited'));
    expect(limited).toBeInstanceOf(GitRateLimited);
    expect(limited).toMatchObject({ retryAfterSeconds: 45 });
    await expect(provider.getRepository('acme/down')).rejects.toBeInstanceOf(GitUnreachable);
    expect(String(unauthorized)).not.toContain(FIXTURE_TOKEN);
  });

  it('needs at least two path segments', async () => {
    const { provider } = gitlab('whoami');
    await expect(provider.getRepository('app')).rejects.toBeInstanceOf(GitNotFound);
  });
});
