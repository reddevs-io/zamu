import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text sizes come from the seven steps in tokens.css (text-xs … text-3xl). A hand-set size such as
// text-[13px] or text-[0.8rem] fails here with its file and line. Colours in brackets (text-[oklch(…)])
// and sizes through a token (text-(length:--x)) are not sizes typed by hand and pass.

const SRC = join(import.meta.dirname, '..');
const HAND_SET = /text-\[\d/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('text sizes', () => {
  it('uses the type scale, never text-[<number>…]', () => {
    const self = relative(SRC, import.meta.filename);
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const name = relative(SRC, file);
      if (name === self) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (HAND_SET.test(line)) found.push(`src/${name}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(found, `Use a text step from tokens.css instead of:\n${found.join('\n')}`).toEqual([]);
  });
});
