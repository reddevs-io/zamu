// Test support only: reads fixture folders from disk. The package itself does no I/O.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FolderFile } from '../folder';

export const FIXTURES_DIR = fileURLToPath(new URL('../../test/fixtures', import.meta.url));

/** Every file under `root` (relative to the fixtures folder), with repository-style paths. */
export function readFixtureTree(root: string): FolderFile[] {
  const base = join(FIXTURES_DIR, root);
  const files: FolderFile[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files.push({ path: relative(base, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(base);
  return files.sort((left, right) => (left.path < right.path ? -1 : 1));
}

export function readFixture(path: string): string {
  return readFileSync(join(FIXTURES_DIR, path), 'utf8');
}
