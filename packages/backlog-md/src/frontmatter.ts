import type { ParseError, ParseWarning } from './types';
import {
  atLine,
  findKeyLine,
  isRecord,
  loadYaml,
  normalizeText,
  preprocessFrontmatter,
  splitFrontmatter,
} from './yaml';

export interface ReadFile {
  data: Record<string, unknown>;
  frontmatter: string;
  frontmatterLine: number;
  body: string;
}

/** Splits and loads frontmatter. Every failure is a ParseError value. */
export function readFrontmatter(
  text: string,
): { ok: true; file: ReadFile } | { ok: false; error: ParseError } {
  const split = splitFrontmatter(normalizeText(text));
  if (!split) {
    return {
      ok: false,
      error: {
        code: 'missing_frontmatter',
        message: 'file does not start with --- frontmatter (line 1)',
        line: 1,
      },
    };
  }
  const loaded = loadYaml(preprocessFrontmatter(split.frontmatter), split.frontmatterLine);
  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid_yaml',
        message: `frontmatter is not valid YAML: ${loaded.reason}${atLine(loaded.line)}`,
        ...(loaded.line !== undefined && { line: loaded.line }),
      },
    };
  }
  const value = loaded.value ?? {};
  if (!isRecord(value)) {
    return {
      ok: false,
      error: {
        code: 'invalid_frontmatter',
        message: 'frontmatter must be a list of key: value lines (line 2)',
        line: 2,
      },
    };
  }
  return {
    ok: true,
    file: {
      data: value,
      frontmatter: split.frontmatter,
      frontmatterLine: split.frontmatterLine,
      body: split.body,
    },
  };
}

/** Reads typed values out of a frontmatter record, collecting warnings for values it drops. */
export class FieldReader {
  readonly warnings: ParseWarning[] = [];
  private readonly file: ReadFile;

  constructor(file: ReadFile) {
    this.file = file;
  }

  line(key: string): number | undefined {
    return findKeyLine(this.file.frontmatter, key, this.file.frontmatterLine);
  }

  warn(code: ParseWarning['code'], field: string, message: string): void {
    const line = this.line(field);
    this.warnings.push({
      code,
      field,
      message: `${message}${atLine(line)}`,
      ...(line !== undefined && { line }),
    });
  }

  has(key: string): boolean {
    const value = this.file.data[key];
    return value !== undefined && value !== null && value !== '';
  }

  /** A scalar as trimmed text; null when missing or empty. Mappings and lists are dropped with a warning. */
  text(key: string): string | null {
    const value = this.file.data[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') {
      this.warn('ignored_value', key, `${key} must be a single value and was ignored`);
      return null;
    }
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  /** A list of trimmed strings. A single value counts as a one-item list. */
  list(key: string): string[] {
    const value = this.file.data[key];
    if (value === undefined || value === null) return [];
    const items = Array.isArray(value) ? value : [value];
    const result: string[] = [];
    let dropped = false;
    for (const item of items) {
      if (item === null || item === undefined) continue;
      if (typeof item === 'object') {
        dropped = true;
        continue;
      }
      const text = String(item).trim();
      if (text) result.push(text);
    }
    if (dropped)
      this.warn('ignored_value', key, `${key} has entries that are not plain values; they were ignored`);
    return result;
  }

  number(key: string): number | null {
    const value = this.file.data[key];
    if (value === undefined || value === null || value === '') return null;
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (typeof value === 'object' || !Number.isFinite(number)) {
      this.warn('ignored_value', key, `${key} must be a number and was ignored`);
      return null;
    }
    return number;
  }

  raw(key: string): unknown {
    return this.file.data[key];
  }

  unknown(known: ReadonlySet<string>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this.file.data).filter(([key]) => !known.has(key)));
  }
}
