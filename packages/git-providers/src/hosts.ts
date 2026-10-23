// Hosts of git connections: normalisation, API and web base URLs, and the host safety check.
// A connection makes the server call whatever host an admin typed, so every request first checks
// that the host resolves to a public address (unless private hosts are allowed). Link-local and
// cloud metadata addresses are refused even then.

import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { ProviderKind } from './types';

/**
 * Lowercase `host` or `host:port` from what a person typed: a bare host, or a URL with a scheme and
 * an optional trailing slash. Null for anything else (paths, credentials, query strings, bad names).
 */
export function normalizeHost(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.search || url.hash || raw.endsWith('?') || raw.endsWith('#')) {
    return null;
  }
  if (url.pathname !== '/') return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) return null;
  const isIpv6 = /^\[[0-9a-f:.]+\]$/.test(hostname);
  if (!isIpv6 && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(hostname)) {
    return null;
  }
  // `new URL('https://host:443')` drops the default port; an explicit 80 on https is kept.
  return url.port ? `${hostname}:${url.port}` : hostname;
}

/** Hostname without port and without IPv6 brackets. */
export function hostnameOf(host: string): string {
  const ipv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(host);
  if (ipv6) return ipv6[1] as string;
  return host.replace(/:\d+$/, '');
}

export interface BaseUrlOptions {
  /** Use http:// instead of https:// (hosts listed in GIT_HTTP_HOSTS). Ignored for github.com. */
  allowHttp?: boolean;
}

/**
 * API base URL without a trailing slash: https://api.github.com for github.com, /api/v3 for GitHub
 * Enterprise, /api/v4 for GitLab, /api/v1 for Gitea and Forgejo.
 */
export function deriveApiBaseUrl(provider: ProviderKind, host: string, options: BaseUrlOptions = {}): string {
  if (provider === 'github' && host === 'github.com') return 'https://api.github.com';
  const origin = deriveWebBaseUrl(provider, host, options);
  switch (provider) {
    case 'github':
      return `${origin}/api/v3`;
    case 'gitlab':
      return `${origin}/api/v4`;
    case 'gitea':
      return `${origin}/api/v1`;
  }
}

/** Origin of the web pages: https://github.com, https://gitlab.example.com… */
export function deriveWebBaseUrl(
  _provider: ProviderKind,
  host: string,
  options: BaseUrlOptions = {},
): string {
  if (host === 'github.com') return 'https://github.com';
  return `${options.allowHttp ? 'http' : 'https'}://${host}`;
}

// --- Address classification -------------------------------------------------------------------

export type AddressClass = 'public' | 'private' | 'blocked';

// Never allowed: "this network", link-local (cloud metadata lives at 169.254.169.254), multicast,
// broadcast, and the AWS IPv6 metadata endpoint.
const blocked = new BlockList();
blocked.addSubnet('0.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addSubnet('224.0.0.0', 4, 'ipv4');
blocked.addAddress('255.255.255.255', 'ipv4');
blocked.addAddress('::', 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');
blocked.addAddress('fd00:ec2::254', 'ipv6');

// Allowed only with GIT_ALLOW_PRIVATE_HOSTS: loopback, private, shared (CGNAT), documentation,
// benchmarking and reserved ranges, IPv6 unique-local and documentation ranges.
const nonPublic = new BlockList();
for (const [network, prefix] of [
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['240.0.0.0', 4],
] as const) {
  nonPublic.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::1', 128],
  ['fc00::', 7],
  ['2001:db8::', 32],
  ['100::', 64],
  ['64:ff9b:1::', 48],
] as const) {
  nonPublic.addSubnet(network, prefix, 'ipv6');
}

/** 16 bytes of an IPv6 address, or null when it does not parse. */
function ipv6Bytes(address: string): number[] | null {
  let text = address.replace(/%.*$/, '');
  const tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const octets = (dotted[1] as string).split('.').map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    tail.push(...octets);
    text = `${text.slice(0, -(dotted[1] as string).length)}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':') : []);
  const head = parse(halves[0] as string);
  const rest = halves.length === 2 ? parse(halves[1] as string) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

/** The IPv4 address an IPv6 address carries (IPv4-mapped, NAT64, 6to4), or null. */
function embeddedIpv4(address: string): string | null {
  const bytes = ipv6Bytes(address);
  if (!bytes) return null;
  const zeroes = (from: number, to: number) => bytes.slice(from, to).every((byte) => byte === 0);
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (deprecated compatible form). :: and ::1 keep their own rules.
  if (zeroes(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return bytes.slice(12).join('.');
  if (zeroes(0, 12) && !(zeroes(12, 15) && (bytes[15] === 0 || bytes[15] === 1))) {
    return bytes.slice(12).join('.');
  }
  // 64:ff9b::/96, the well-known NAT64 prefix.
  if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zeroes(4, 12)) {
    return bytes.slice(12).join('.');
  }
  // 2002::/16, 6to4: the IPv4 address follows the prefix.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return bytes.slice(2, 6).join('.');
  return null;
}

/** Whether an IP address is public, private (allowed with GIT_ALLOW_PRIVATE_HOSTS) or always blocked. */
export function classifyAddress(address: string): AddressClass {
  const version = isIP(address.replace(/%.*$/, ''));
  if (version === 0) return 'blocked';
  if (version === 6) {
    const v4 = embeddedIpv4(address);
    if (v4) return classifyAddress(v4);
  }
  const type = version === 4 ? 'ipv4' : 'ipv6';
  const clean = address.replace(/%.*$/, '');
  if (blocked.check(clean, type)) return 'blocked';
  if (nonPublic.check(clean, type)) return 'private';
  return 'public';
}

// --- Host check ---------------------------------------------------------------------------------

export type LookupFn = (hostname: string) => Promise<string[]>;

export interface HostPolicy {
  /** GIT_ALLOW_PRIVATE_HOSTS: allow loopback and private ranges. Link-local and metadata stay refused. */
  allowPrivate: boolean;
  /** GIT_HTTP_HOSTS: hosts (with or without port) reached over plain HTTP. */
  httpHosts?: readonly string[];
  /** DNS resolver, for tests. Defaults to the system resolver (all addresses). */
  lookup?: LookupFn;
}

export type HostRefusal = 'invalid_host' | 'unresolvable' | 'private_address' | 'blocked_address';

export type HostCheck =
  | { ok: true; host: string; protocol: 'https' | 'http'; addresses: string[] }
  | { ok: false; host: string; reason: HostRefusal; address?: string; message: string };

const systemLookup: LookupFn = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

/**
 * Resolves the host and decides whether the server may call it. Every address the name resolves to
 * must pass, since the HTTP client may pick any of them.
 */
export async function isAllowedHost(input: string, policy: HostPolicy): Promise<HostCheck> {
  const host = normalizeHost(input);
  if (!host) {
    return { ok: false, host: input, reason: 'invalid_host', message: 'Not a valid host name.' };
  }
  const hostname = hostnameOf(host);
  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = await (policy.lookup ?? systemLookup)(hostname);
    } catch {
      addresses = [];
    }
  }
  if (addresses.length === 0) {
    return { ok: false, host, reason: 'unresolvable', message: `${hostname} does not resolve.` };
  }
  for (const address of addresses) {
    const kind = classifyAddress(address);
    if (kind === 'blocked') {
      return {
        ok: false,
        host,
        reason: 'blocked_address',
        address,
        message: `${hostname} resolves to ${address}, a link-local, metadata or reserved address. It cannot be used.`,
      };
    }
    if (kind === 'private' && !policy.allowPrivate) {
      return {
        ok: false,
        host,
        reason: 'private_address',
        address,
        message: `${hostname} resolves to the private address ${address}. Set GIT_ALLOW_PRIVATE_HOSTS=true to allow it.`,
      };
    }
  }
  const httpHosts = (policy.httpHosts ?? []).map((entry) => normalizeHost(entry)).filter(Boolean);
  const protocol = httpHosts.includes(host) || httpHosts.includes(hostname) ? 'http' : 'https';
  return { ok: true, host, protocol, addresses };
}
