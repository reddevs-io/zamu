import { type GitConnection, parseRepositoryUrl } from '@pm/contracts';

// Picking a git connection for a repository. Connection hosts may carry a port (localhost:3300) while
// parseRepositoryUrl drops ports, so connections and repositories are compared by host name only.

/** Lowercase host name without the port: "localhost:3300" → "localhost", "[::1]:3300" → "::1". */
export function hostName(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(1, end) : value;
  }
  const colons = value.split(':').length - 1;
  // One colon: host:port. More: a bare IPv6 address.
  return colons === 1 ? (value.split(':')[0] ?? value) : value;
}

/** True when the connection reads the host the repository lives on. */
export function connectionReads(connection: Pick<GitConnection, 'host'>, repositoryHost: string): boolean {
  return hostName(connection.host) === hostName(repositoryHost);
}

/**
 * The connection to preselect for a repository URL: the first working one on its host, else the
 * first on its host. Null when the URL does not parse or no connection reads that host.
 */
export function pickConnection<T extends Pick<GitConnection, 'id' | 'host' | 'status'>>(
  connections: readonly T[],
  repository: string | null | undefined,
): T | null {
  const parsed = repository ? parseRepositoryUrl(repository) : null;
  if (!parsed) return null;
  const onHost = connections.filter((connection) => connectionReads(connection, parsed.host));
  return onHost.find((connection) => connection.status === 'working') ?? onHost[0] ?? null;
}
