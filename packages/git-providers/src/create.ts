import { GiteaProvider } from './gitea';
import { GITHUB_API_VERSION, GitHubProvider } from './github';
import { GitLabProvider } from './gitlab';
import { deriveApiBaseUrl, deriveWebBaseUrl, normalizeHost } from './hosts';
import { HttpClient } from './http';
import type { CreateProviderOptions, GitProvider } from './types';

const USER_AGENT = 'zamu-git-providers';

/** Adapter for one host and token. Throws RangeError for a host that normalizeHost refuses. */
export function createProvider(options: CreateProviderOptions): GitProvider {
  const host = normalizeHost(options.host);
  if (!host) throw new RangeError('Not a valid git host.');
  const allowHttp = options.allowHttp ?? false;
  const apiBaseUrl = deriveApiBaseUrl(options.provider, host, { allowHttp });
  const webBaseUrl = deriveWebBaseUrl(options.provider, host, { allowHttp });

  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  const token = options.token;
  switch (options.provider) {
    case 'github':
      headers['x-github-api-version'] = GITHUB_API_VERSION;
      if (token) headers.authorization = `Bearer ${token}`;
      break;
    case 'gitlab':
      // Personal, project and group access tokens work as OAuth-style bearer tokens.
      if (token) headers.authorization = `Bearer ${token}`;
      break;
    case 'gitea':
      if (token) headers.authorization = `token ${token}`;
      break;
  }

  const http = new HttpClient({
    apiBaseUrl,
    headers,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.hostPolicy ? { hostPolicy: options.hostPolicy } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.now ? { now: options.now } : {}),
  });

  switch (options.provider) {
    case 'github':
      return new GitHubProvider(host, apiBaseUrl, webBaseUrl, http);
    case 'gitlab':
      return new GitLabProvider(host, apiBaseUrl, webBaseUrl, http);
    case 'gitea':
      return new GiteaProvider(host, apiBaseUrl, webBaseUrl, http);
  }
}
