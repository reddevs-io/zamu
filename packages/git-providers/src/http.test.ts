import { describe, expect, it } from 'vitest';
import { createProvider } from './create';
import { GitHostRefused, GitUnexpected, GitUnreachable } from './errors';
import { nextLink } from './http';
import type { FetchFn } from './types';

const TOKEN = 'secret-token-value';

describe('nextLink', () => {
  it('finds rel="next" among other relations', () => {
    expect(
      nextLink(
        '<https://x/api?page=1>; rel="prev", <https://x/api?page=3>; rel="next", <https://x/api?page=9>; rel="last"',
      ),
    ).toBe('https://x/api?page=3');
    expect(nextLink('<https://x/a>; rel=next')).toBe('https://x/a');
    expect(nextLink('<https://x/a>; rel="last"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

describe('transport errors', () => {
  it('maps connection failures to GitUnreachable with the system code, without the token', async () => {
    const fetch: FetchFn = async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      });
    };
    const provider = createProvider({ provider: 'gitea', host: 'git.example.com', token: TOKEN, fetch });
    const error = await provider.whoami().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitUnreachable);
    expect(error).toMatchObject({ kind: 'unreachable', code: 'ECONNREFUSED' });
    expect(String(error)).not.toContain(TOKEN);
  });

  it('maps a timeout to GitUnreachable with code timeout', async () => {
    const fetch: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const provider = createProvider({
      provider: 'github',
      host: 'github.com',
      token: TOKEN,
      fetch,
      timeoutMs: 20,
    });
    await expect(provider.whoami()).rejects.toMatchObject({ kind: 'unreachable', code: 'timeout' });
  });

  it('reports a body that is not JSON as unexpected', async () => {
    const fetch: FetchFn = async () => new Response('<html>login</html>', { status: 200 });
    const provider = createProvider({ provider: 'gitlab', host: 'gitlab.example.com', token: TOKEN, fetch });
    await expect(provider.whoami()).rejects.toBeInstanceOf(GitUnexpected);
  });

  it('refuses a pagination link outside the API path', async () => {
    const fetch: FetchFn = async () =>
      new Response('[]', {
        status: 200,
        headers: { link: '<https://gitlab.example.com/other/thing?page=2>; rel="next"' },
      });
    const provider = createProvider({ provider: 'gitlab', host: 'gitlab.example.com', token: TOKEN, fetch });
    await expect(provider.listTree('a/b', 'c'.repeat(40), '')).rejects.toBeInstanceOf(GitUnexpected);
  });
});

describe('host policy', () => {
  it('checks the host before every request and refuses private addresses', async () => {
    const calls: string[] = [];
    const fetch: FetchFn = async (input) => {
      calls.push(String(input));
      return Response.json({ login: 'me' });
    };
    const provider = createProvider({
      provider: 'gitea',
      host: 'git.internal',
      token: TOKEN,
      fetch,
      hostPolicy: { allowPrivate: false, lookup: async () => ['10.0.0.5'] },
    });
    const error = await provider.whoami().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHostRefused);
    expect(error).toMatchObject({ kind: 'host_refused', code: 'private_address' });
    expect(calls).toEqual([]);
  });

  it('allows private hosts when the policy says so, but never metadata addresses', async () => {
    const fetch: FetchFn = async () => Response.json({ login: 'me' }, { headers: { 'x-total-count': '2' } });
    const allowed = createProvider({
      provider: 'gitea',
      host: 'git.internal',
      token: TOKEN,
      fetch,
      hostPolicy: { allowPrivate: true, lookup: async () => ['10.0.0.5'] },
    });
    await expect(allowed.whoami()).resolves.toEqual({ login: 'me', repoCount: 2 });

    const metadata = createProvider({
      provider: 'gitea',
      host: 'git.internal',
      token: TOKEN,
      fetch,
      hostPolicy: { allowPrivate: true, lookup: async () => ['169.254.169.254'] },
    });
    await expect(metadata.whoami()).rejects.toMatchObject({ code: 'blocked_address' });
  });

  it('re-checks DNS on each request, so a name that changes to a private address is refused', async () => {
    let address = '203.0.114.10';
    const fetch: FetchFn = async () => Response.json({ login: 'me', public_repos: 1 });
    const provider = createProvider({
      provider: 'github',
      host: 'ghe.example.com',
      token: TOKEN,
      fetch,
      hostPolicy: { allowPrivate: false, lookup: async () => [address] },
    });
    await expect(provider.whoami()).resolves.toEqual({ login: 'me', repoCount: 1 });
    address = '127.0.0.1';
    await expect(provider.whoami()).rejects.toBeInstanceOf(GitHostRefused);
  });

  it('refuses an invalid host when the adapter is created', () => {
    expect(() =>
      createProvider({ provider: 'gitlab', host: 'https://gitlab.com/group/app', token: '' }),
    ).toThrow(RangeError);
  });
});
