import { describe, expect, it } from 'vitest';
import { classifyAddress, deriveApiBaseUrl, deriveWebBaseUrl, isAllowedHost, normalizeHost } from './hosts';

const resolvesTo =
  (...addresses: string[]) =>
  async () =>
    addresses;

describe('normalizeHost', () => {
  it.each([
    ['gitlab.example.com', 'gitlab.example.com'],
    ['  GitLab.Example.COM  ', 'gitlab.example.com'],
    ['https://gitlab.example.com/', 'gitlab.example.com'],
    ['https://gitlab.example.com:443', 'gitlab.example.com'],
    ['http://localhost:3300', 'localhost:3300'],
    ['git.example.com.', 'git.example.com'],
    ['10.0.0.5:8443', '10.0.0.5:8443'],
    ['[::1]:3000', '[::1]:3000'],
    ['bücher.example', 'xn--bcher-kva.example'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });

  it.each([
    '',
    'https://gitlab.example.com/group/app',
    'user:pass@gitlab.example.com',
    'ftp://gitlab.example.com',
    'gitlab.example.com?x=1',
    'gitlab example.com',
    'under_score.example.com',
    '-bad.example.com',
  ])('refuses %j', (input) => {
    expect(normalizeHost(input)).toBeNull();
  });
});

describe('base URLs', () => {
  it('follows the plan: api.github.com, /api/v3, /api/v4, /api/v1', () => {
    expect(deriveApiBaseUrl('github', 'github.com')).toBe('https://api.github.com');
    expect(deriveApiBaseUrl('github', 'github.com', { allowHttp: true })).toBe('https://api.github.com');
    expect(deriveApiBaseUrl('github', 'ghe.example.com')).toBe('https://ghe.example.com/api/v3');
    expect(deriveApiBaseUrl('gitlab', 'gitlab.com')).toBe('https://gitlab.com/api/v4');
    expect(deriveApiBaseUrl('gitea', 'codeberg.org')).toBe('https://codeberg.org/api/v1');
    expect(deriveApiBaseUrl('gitea', 'localhost:3300', { allowHttp: true })).toBe(
      'http://localhost:3300/api/v1',
    );
    expect(deriveWebBaseUrl('github', 'github.com', { allowHttp: true })).toBe('https://github.com');
    expect(deriveWebBaseUrl('gitlab', 'gitlab.example.com')).toBe('https://gitlab.example.com');
  });
});

describe('classifyAddress', () => {
  it.each([
    ['140.82.121.6', 'public'],
    ['2606:50c0:8000::153', 'public'],
    ['10.1.2.3', 'private'],
    ['172.20.0.1', 'private'],
    ['192.168.1.10', 'private'],
    ['127.0.0.1', 'private'],
    ['100.64.0.1', 'private'],
    ['::1', 'private'],
    ['fd12:3456::1', 'private'],
    ['::ffff:10.0.0.1', 'private'],
    ['::ffff:140.82.121.6', 'public'],
    ['169.254.169.254', 'blocked'],
    ['169.254.10.1', 'blocked'],
    ['::ffff:169.254.169.254', 'blocked'],
    ['64:ff9b::a9fe:a9fe', 'blocked'],
    ['2002:a9fe:a9fe::1', 'blocked'],
    ['fd00:ec2::254', 'blocked'],
    ['fe80::1', 'blocked'],
    ['0.0.0.0', 'blocked'],
    ['::', 'blocked'],
    ['::2', 'blocked'],
    ['224.0.0.1', 'blocked'],
    ['not-an-ip', 'blocked'],
  ])('%s is %s', (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });
});

describe('isAllowedHost', () => {
  it('allows a host that resolves to public addresses, over HTTPS', async () => {
    await expect(
      isAllowedHost('gitlab.example.com', {
        allowPrivate: false,
        lookup: resolvesTo('203.0.114.10', '2a01:4f8::1'),
      }),
    ).resolves.toEqual({
      ok: true,
      host: 'gitlab.example.com',
      protocol: 'https',
      addresses: ['203.0.114.10', '2a01:4f8::1'],
    });
  });

  it('refuses private addresses unless allowed', async () => {
    const lookup = resolvesTo('10.0.0.5');
    await expect(isAllowedHost('git.internal', { allowPrivate: false, lookup })).resolves.toMatchObject({
      ok: false,
      reason: 'private_address',
      address: '10.0.0.5',
    });
    await expect(isAllowedHost('git.internal', { allowPrivate: true, lookup })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('refuses a host when any of its addresses is private', async () => {
    const lookup = resolvesTo('203.0.114.10', '192.168.0.4');
    await expect(isAllowedHost('mixed.example.com', { allowPrivate: false, lookup })).resolves.toMatchObject({
      ok: false,
      reason: 'private_address',
    });
  });

  it('always refuses link-local and metadata addresses', async () => {
    for (const address of ['169.254.169.254', 'fd00:ec2::254', '::ffff:169.254.169.254']) {
      await expect(
        isAllowedHost('metadata.example.com', { allowPrivate: true, lookup: resolvesTo(address) }),
      ).resolves.toMatchObject({ ok: false, reason: 'blocked_address' });
    }
    await expect(isAllowedHost('169.254.169.254', { allowPrivate: true })).resolves.toMatchObject({
      ok: false,
      reason: 'blocked_address',
    });
  });

  it('checks IP literals without DNS', async () => {
    const lookup = async () => {
      throw new Error('no DNS for literals');
    };
    await expect(isAllowedHost('127.0.0.1:3300', { allowPrivate: false, lookup })).resolves.toMatchObject({
      ok: false,
      reason: 'private_address',
    });
    await expect(isAllowedHost('[::1]:3300', { allowPrivate: true, lookup })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('reports names that do not resolve and invalid hosts', async () => {
    const failing = async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    };
    await expect(
      isAllowedHost('nowhere.invalid', { allowPrivate: false, lookup: failing }),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'unresolvable',
    });
    await expect(
      isAllowedHost('nowhere.invalid', { allowPrivate: false, lookup: resolvesTo() }),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'unresolvable',
    });
    await expect(isAllowedHost('https://x.example.com/path', { allowPrivate: false })).resolves.toMatchObject(
      {
        ok: false,
        reason: 'invalid_host',
      },
    );
  });

  it('uses HTTP for hosts listed in httpHosts, with or without the port', async () => {
    const lookup = resolvesTo('127.0.0.1');
    await expect(
      isAllowedHost('localhost:3300', { allowPrivate: true, httpHosts: ['localhost'], lookup }),
    ).resolves.toMatchObject({ ok: true, protocol: 'http' });
    await expect(
      isAllowedHost('localhost:3300', { allowPrivate: true, httpHosts: ['localhost:3300'], lookup }),
    ).resolves.toMatchObject({ ok: true, protocol: 'http' });
    await expect(
      isAllowedHost('localhost:3300', { allowPrivate: true, httpHosts: ['localhost:9999'], lookup }),
    ).resolves.toMatchObject({ ok: true, protocol: 'https' });
  });

  it('resolves real names with the system resolver', async () => {
    await expect(isAllowedHost('localhost', { allowPrivate: false })).resolves.toMatchObject({
      ok: false,
      reason: 'private_address',
    });
  });
});
