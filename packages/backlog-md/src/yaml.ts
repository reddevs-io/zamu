import { CORE_SCHEMA, load, YAMLException } from 'js-yaml';

/** LF line endings, no byte order mark. Every parser works on this form. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export interface SplitFile {
  /** Frontmatter text between the fences. */
  frontmatter: string;
  body: string;
  /** 1-based file line of the first frontmatter line. */
  frontmatterLine: number;
}

/** Splits `---` fenced frontmatter from the body. Null when the file does not start with a fence. */
export function splitFrontmatter(normalized: string): SplitFile | null {
  const lines = normalized.split('\n');
  if (lines[0]?.trimEnd() !== '---') return null;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trimEnd() === '---') {
      return {
        frontmatter: lines.slice(1, index).join('\n'),
        body: lines.slice(index + 1).join('\n'),
        frontmatterLine: 2,
      };
    }
  }
  return null;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function quoteFlowList(prefix: string, value: string): string | null {
  const match = value.match(/^\[(.*)\]\s*(#.*)?$/);
  if (!match) return null;
  const items = (match[1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith('@') ? quote(entry) : entry));
  return `${prefix}[${items.join(', ')}]${match[2] ? ` ${match[2]}` : ''}`;
}

/**
 * Backlog.md writes `assignee: @name`, which YAML refuses (`@` is reserved). Quote those values the
 * way Backlog.md's own preprocessing does, and also `- @name` list items.
 */
export function preprocessFrontmatter(frontmatter: string): string {
  return frontmatter
    .split('\n')
    .map((line) => {
      const field = line.match(/^(\s*(?:assignee|reporter)\s*:\s*)(.*)$/);
      if (field) {
        const prefix = field[1] ?? '';
        const value = (field[2] ?? '').trim();
        const flow = quoteFlowList(prefix, value);
        if (flow !== null) return flow;
        if (value && !/^[['"-]/.test(value)) return `${prefix}${quote(value)}`;
        return line;
      }
      const item = line.match(/^(\s*-\s+)(@.*)$/);
      if (item) return `${item[1]}${quote((item[2] ?? '').trim())}`;
      return line;
    })
    .join('\n');
}

export type YamlResult = { ok: true; value: unknown } | { ok: false; reason: string; line?: number };

/**
 * Loads YAML with the core schema: no timestamp type, so dates stay the strings that were written
 * and the parser applies Backlog.md's date rules itself. `firstLine` is the file line of the text's
 * first line, used to report error lines in file terms.
 */
export function loadYaml(text: string, firstLine = 1): YamlResult {
  try {
    return { ok: true, value: load(text, { schema: CORE_SCHEMA }) };
  } catch (error) {
    if (error instanceof YAMLException) {
      const line = typeof error.mark?.line === 'number' ? error.mark.line + firstLine : undefined;
      return { ok: false, reason: error.reason || 'invalid YAML', ...(line !== undefined && { line }) };
    }
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid YAML' };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 1-based file line of the last top-level `key:` line in a block, or undefined. */
export function findKeyLine(text: string, key: string, firstLine = 1): number | undefined {
  const lines = text.split('\n');
  const pattern = new RegExp(`^\\s*["']?${key}["']?\\s*:`);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (pattern.test(lines[index] ?? '')) return index + firstLine;
  }
  return undefined;
}

/** "(line 9)" or "". */
export function atLine(line: number | undefined): string {
  return line === undefined ? '' : ` (line ${line})`;
}
