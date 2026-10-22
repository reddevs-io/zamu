/** Read-only keys can list and get; write keys can also create and update. */
export type ApiKeyAccess = 'read' | 'write';

/** Scope of an API key, stored as the key's Better Auth metadata. */
export interface ApiKeyMetadata {
  workspaceId: string;
  /** "all" for every project in the workspace, otherwise the allowed project ids. */
  projects: 'all' | string[];
  access: ApiKeyAccess;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses key metadata (an object, or the JSON string Better Auth stores) into ApiKeyMetadata.
 * Returns null when the shape is wrong, so a malformed key never gets a wider scope than intended.
 */
export function parseApiKeyMetadata(raw: unknown): ApiKeyMetadata | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  const { workspaceId, projects, access } = value;
  if (typeof workspaceId !== 'string' || workspaceId === '') return null;
  if (access !== 'read' && access !== 'write') return null;
  if (projects === 'all') return { workspaceId, projects, access };
  if (Array.isArray(projects) && projects.every((id): id is string => typeof id === 'string' && id !== '')) {
    return { workspaceId, projects: [...projects], access };
  }
  return null;
}
