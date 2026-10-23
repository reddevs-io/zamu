// The one place that talks HTTP. It adds auth, a timeout and the host check, follows redirects only
// on the same origin (so the token never leaves the configured host), and turns every failure into
// a typed GitProviderError with a message written here.

import {
  GitHostRefused,
  GitNotFound,
  GitRateLimited,
  GitUnauthorized,
  GitUnexpected,
  GitUnreachable,
} from './errors';
import { isAllowedHost } from './hosts';
import type { CreateProviderOptions, FetchFn } from './types';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

export interface HttpClientOptions {
  apiBaseUrl: string;
  headers: Record<string, string>;
  fetch?: FetchFn;
  hostPolicy?: CreateProviderOptions['hostPolicy'];
  timeoutMs?: number;
  now?: () => number;
}

export class HttpClient {
  readonly apiBaseUrl: string;
  private readonly origin: string;
  private readonly basePath: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: FetchFn;
  private readonly hostPolicy: HttpClientOptions['hostPolicy'];
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: HttpClientOptions) {
    const base = new URL(options.apiBaseUrl);
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
    this.origin = base.origin;
    this.basePath = base.pathname.replace(/\/+$/, '');
    this.headers = options.headers;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.hostPolicy = options.hostPolicy;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  /** URL for an API path like `/repos/a/b` with optional query parameters. */
  url(path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  /**
   * A pagination link from a response, moved onto the configured origin. A provider behind a proxy
   * may advertise another scheme or host in its Link headers; the token is only ever sent to the
   * configured origin, and only below the API base path.
   */
  followLink(link: string): URL {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      throw new GitUnexpected('The provider sent a pagination link that is not a URL.');
    }
    if (!url.pathname.startsWith(`${this.basePath}/`)) {
      throw new GitUnexpected('The provider sent a pagination link outside its API.');
    }
    return new URL(`${url.pathname}${url.search}`, this.origin);
  }

  /** GET with auth. Resolves only for 2xx; every other outcome throws a GitProviderError. */
  async get(target: URL, accept = 'application/json'): Promise<Response> {
    let url = target;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.origin !== this.origin) {
        throw new GitUnexpected(`The provider redirected to another host (${url.host}).`);
      }
      await this.checkHost(url);
      const response = await this.send(url, accept);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location)
          throw new GitUnexpected(`The provider answered ${response.status} without a location.`);
        try {
          url = new URL(location, url);
        } catch {
          throw new GitUnexpected('The provider redirected to an address that is not a URL.');
        }
        continue;
      }
      if (response.ok) return response;
      throw await this.toError(response);
    }
    throw new GitUnexpected('The provider redirected too many times.');
  }

  async getJson<T = unknown>(target: URL): Promise<{ data: T; response: Response }> {
    const response = await this.get(target);
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw networkError(target, error);
    }
    try {
      return { data: JSON.parse(text) as T, response };
    } catch {
      throw new GitUnexpected('The provider sent a response that is not JSON.');
    }
  }

  async getBytes(target: URL, accept?: string): Promise<Uint8Array> {
    const response = await this.get(target, accept);
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      throw networkError(target, error);
    }
  }

  private async checkHost(url: URL): Promise<void> {
    if (!this.hostPolicy) return;
    const check = await isAllowedHost(url.host, this.hostPolicy);
    if (!check.ok) throw new GitHostRefused(check.message, { code: check.reason });
  }

  private async send(url: URL, accept: string): Promise<Response> {
    try {
      return await this.fetchFn(url.toString(), {
        method: 'GET',
        headers: { ...this.headers, accept },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw networkError(url, error);
    }
  }

  private async toError(response: Response): Promise<Error> {
    const { status } = response;
    // Read a little of the body to spot GitHub's 403 rate-limit answers. Never copied into messages.
    let body = '';
    try {
      body = (await response.text()).slice(0, 2000);
    } catch {
      body = '';
    }
    const retryAfter = this.retryAfterSeconds(response.headers);
    if (status === 429 || (status === 403 && (retryAfter.signalled || /rate limit/i.test(body)))) {
      return new GitRateLimited(
        `The provider rate limit was reached. Retry in ${retryAfter.seconds} seconds.`,
        retryAfter.seconds,
        { status },
      );
    }
    if (status === 401) {
      return new GitUnauthorized('The provider rejected the access token.', { status });
    }
    if (status === 403) {
      return new GitUnauthorized('The access token has no access to this resource.', {
        status,
        code: 'forbidden',
      });
    }
    if (status === 404 || status === 410) {
      return new GitNotFound(
        'The provider has no such repository, branch or object, or the token cannot see it.',
        {
          status,
        },
      );
    }
    if (status >= 500) {
      return new GitUnreachable(`The provider answered ${status}.`, { status });
    }
    return new GitUnexpected(`The provider answered ${status}.`, { status });
  }

  private retryAfterSeconds(headers: Headers): { seconds: number; signalled: boolean } {
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return { seconds: Math.max(0, Math.ceil(seconds)), signalled: true };
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) {
        return { seconds: Math.max(0, Math.ceil((date - this.now()) / 1000)), signalled: true };
      }
    }
    const remaining = headers.get('x-ratelimit-remaining') ?? headers.get('ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset') ?? headers.get('ratelimit-reset');
    if (remaining === '0') {
      const resetAt = Number(reset);
      if (reset && Number.isFinite(resetAt)) {
        return { seconds: Math.max(0, Math.ceil(resetAt - this.now() / 1000)), signalled: true };
      }
      return { seconds: DEFAULT_RETRY_AFTER_SECONDS, signalled: true };
    }
    return { seconds: DEFAULT_RETRY_AFTER_SECONDS, signalled: false };
  }
}

function networkError(url: URL, error: unknown): GitUnreachable {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new GitUnreachable(`${url.host} did not answer in time.`, { code: 'timeout' });
  }
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  const code = typeof cause?.code === 'string' ? cause.code : 'network';
  return new GitUnreachable(`Could not reach ${url.host} (${code}).`, { code });
}

/** `rel="next"` target of a Link header, or null. */
export function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /^<([^>]+)>(.*)$/.exec(part.trim());
    const rel = match ? /;\s*rel="?([^";]+)"?/i.exec(match[2] as string) : null;
    if (match && rel && (rel[1] as string).toLowerCase().split(/\s+/).includes('next')) {
      return match[1] as string;
    }
  }
  return null;
}

const utf8 = new TextDecoder('utf-8');

/** UTF-8 text of raw bytes. TextDecoder drops a leading byte-order mark. */
export function decodeUtf8(bytes: Uint8Array): string {
  return utf8.decode(bytes);
}

/** UTF-8 text of base64 content as GitHub and Gitea send it (with line breaks). */
export function decodeBase64(content: string): string {
  return decodeUtf8(Buffer.from(content.replace(/\s+/g, ''), 'base64'));
}

/** Percent-encodes each segment of a slash-separated path (branch names, file paths). */
export function encodeSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

// --- Response shape helpers -----------------------------------------------------------------------

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new GitUnexpected(`The provider sent an unexpected ${what}.`);
}

export function asArray(value: unknown, what: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new GitUnexpected(`The provider sent an unexpected ${what}.`);
}

export function stringField(record: Record<string, unknown>, key: string, what: string): string {
  const value = record[key];
  if (typeof value === 'string' && value) return value;
  throw new GitUnexpected(`The provider sent ${what} without ${key}.`);
}
