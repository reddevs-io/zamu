// Git repository URLs. A project links to one repository; the server stores the URL as typed plus a
// normalised key, and the CLI matches a clone's remote against that key. Both sides use this parser,
// so `git@gitlab.com:team/app.git` and `https://gitlab.com/team/app` are the same repository.

export const MAX_REPOSITORY_URL_LENGTH = 500;

export const REPOSITORY_URL_HINT =
  'Not a clone URL. Use the form https://host/owner/repo or git@host:owner/repo.';

export interface Repository {
  /** Lowercase host without user or port, e.g. `gitlab.com`. */
  host: string;
  /** Path without leading or trailing slashes and without `.git`, case kept, e.g. `team/app`. */
  path: string;
  /** host/path, the form the web app and the CLI show. */
  short: string;
  /** host/path in lowercase: two URLs are the same repository when their keys are equal. */
  key: string;
  /** Page of the repository in a browser. */
  webUrl: string;
}

const SCHEMES = new Set(['https:', 'http:', 'ssh:', 'git:', 'git+ssh:', 'ssh+git:']);
// user@host:path, the scp-like syntax git accepts for SSH. A one-letter host is a Windows drive.
const SCP_LIKE = /^(?:[^@/\s]+@)?([^@/:\s]{2,}):(?!\/\/)(\S+)$/;

/**
 * Parses an HTTPS, SSH (`ssh://` or `user@host:path`) or git URL. Null when the value is not a
 * clone URL: no host, fewer than two path segments, a local path or another scheme.
 */
export function parseRepositoryUrl(value: string): Repository | null {
  const input = value.trim();
  if (!input || input.length > MAX_REPOSITORY_URL_LENGTH || /\s/.test(input)) return null;

  let host: string;
  let rawPath: string;
  let secure = true;
  const scp = SCP_LIKE.exec(input);
  if (scp && !input.includes('://')) {
    host = scp[1] as string;
    rawPath = scp[2] as string;
  } else {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!SCHEMES.has(url.protocol) || !url.hostname) return null;
    if (url.search || url.hash) return null;
    host = url.hostname;
    rawPath = decodeURIComponent(url.pathname);
    secure = url.protocol !== 'http:';
  }

  host = host.toLowerCase().replace(/\.$/, '');
  const segments = rawPath
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);
  if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..')) return null;
  if (!/^[a-z0-9.-]+$/.test(host) && !/^\[[0-9a-f:]+\]$/.test(host)) return null;

  const path = segments.join('/');
  const short = `${host}/${path}`;
  return {
    host,
    path,
    short,
    key: short.toLowerCase(),
    webUrl: `${secure ? 'https' : 'http'}://${short}`,
  };
}

/** True when both URLs point at the same repository. */
export function sameRepository(a: string, b: string): boolean {
  const left = parseRepositoryUrl(a);
  return left !== null && left.key === parseRepositoryUrl(b)?.key;
}
