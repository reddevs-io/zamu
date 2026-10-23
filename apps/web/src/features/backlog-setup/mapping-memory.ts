import { BacklogMappings } from '@pm/contracts';

// Mappings picked during setup, kept in session storage per project so a reload on Mappings or
// Preview keeps them. Cleared once the source is created.

const keyFor = (projectKey: string) => `pm.backlog-setup.mappings.${projectKey}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSavedMappings(projectKey: string): BacklogMappings | null {
  const raw = storage()?.getItem(keyFor(projectKey));
  if (!raw) return null;
  try {
    const parsed = BacklogMappings.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveMappings(projectKey: string, mappings: BacklogMappings): void {
  try {
    storage()?.setItem(keyFor(projectKey), JSON.stringify(mappings));
  } catch {
    // Full or blocked storage: the picks only last until the next reload.
  }
}

export function forgetMappings(projectKey: string): void {
  try {
    storage()?.removeItem(keyFor(projectKey));
  } catch {
    // Nothing to clean up.
  }
}
