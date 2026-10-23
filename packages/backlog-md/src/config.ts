import { posix } from 'node:path';
import type { BacklogConfig, ParseResult, ParseWarning, RootConfig } from './types';
import { atLine, isRecord, loadYaml, normalizeText } from './yaml';

export const DEFAULT_STATUSES = ['To Do', 'In Progress', 'Done'] as const;
export const DEFAULT_PRIORITIES = ['high', 'medium', 'low'] as const;
export const DEFAULT_TASK_PREFIX = 'TASK';
const RESERVED_PREFIXES = new Set(['DRAFT', 'DOC', 'DECISION']);

/** The config Backlog.md uses when a folder has no config.yml. */
export function defaultConfig(): BacklogConfig {
  return {
    projectName: null,
    taskPrefix: DEFAULT_TASK_PREFIX,
    statuses: [...DEFAULT_STATUSES],
    defaultStatus: null,
    priorities: null,
    labels: [],
    legacyMilestones: [],
    zeroPaddedIds: null,
    backlogDirectory: null,
    raw: {},
  };
}

/** A line that starts a mapping key. A list item is never a key, even when it contains a colon. */
const KEY_LINE_PATTERN = /^\s*(?!-\s)[^\s#][^:]*:/;

interface KeyBlock {
  text: string;
  /** 1-based line of the key. */
  line: number;
}

/**
 * The YAML block carrying one key: its line plus the lines that continue it, up to the next key at
 * the same or lower indentation. The last occurrence wins, and a column-0 key outranks an indented
 * look-alike. Mirrors Backlog.md's extractConfigKeyYaml, so one broken key cannot change another.
 */
function extractKeyBlock(lines: string[], key: string): KeyBlock | undefined {
  const keyPattern = new RegExp(`^(\\s*)${key}\\s*:`);
  const indentOf = (line: string) => line.match(keyPattern)?.[1]?.length;
  const start = lines.some((line) => indentOf(line) === 0)
    ? lines.findLastIndex((line) => indentOf(line) === 0)
    : lines.findLastIndex((line) => indentOf(line) !== undefined);
  if (start === -1) return undefined;
  const startIndent = indentOf(lines[start] ?? '') ?? 0;
  const collected: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const indent = line.length - line.trimStart().length;
    if (index > start && line.trim() && indent <= startIndent && KEY_LINE_PATTERN.test(line)) break;
    collected.push(line.slice(Math.min(startIndent, indent)));
  }
  return { text: collected.join('\n'), line: start + 1 };
}

type ListRead = { ok: true; value: string[] | undefined } | { ok: false; message: string; line: number };

function readListKey(text: string, lines: string[], key: string): ListRead {
  const block = extractKeyBlock(lines, key);
  if (!block) return { ok: true, value: undefined };
  let parsed: unknown;
  const fromBlock = loadYaml(block.text, block.line);
  if (fromBlock.ok) {
    parsed = isRecord(fromBlock.value) ? fromBlock.value[key] : undefined;
  } else {
    // Aliases resolve only against anchors elsewhere in the file: retry in document context.
    const fromDocument = loadYaml(text);
    if (!fromDocument.ok) {
      const line = fromBlock.line ?? block.line;
      return { ok: false, message: `${key} is not valid YAML: ${fromBlock.reason}${atLine(line)}`, line };
    }
    parsed = isRecord(fromDocument.value) ? fromDocument.value[key] : undefined;
  }
  if (parsed === null || parsed === undefined) return { ok: true, value: undefined };
  if (Array.isArray(parsed) && parsed.every((item) => item === null || typeof item !== 'object')) {
    return {
      ok: true,
      value: parsed.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0),
    };
  }
  return { ok: false, message: `${key} must be a list of names${atLine(block.line)}`, line: block.line };
}

/** A scalar value from a `key: value` line: quotes removed, trailing comment dropped. */
function scalarValue(raw: string): string {
  const value = raw.trim();
  const quoted = value.match(/^(["'])(.*)\1\s*(?:#.*)?$/);
  if (quoted) return (quoted[2] ?? '').trim();
  return value
    .replace(/\s+#.*$/, '')
    .replace(/['"]/g, '')
    .trim();
}

function normalizeDirectory(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:[a-zA-Z]:)?[\\/]/.test(trimmed)) return null;
  const normalized = posix.normalize(trimmed.replace(/\\/g, '/')).replace(/\/+$/g, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function scalarLines(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    values.set(trimmed.slice(0, colon).trim(), trimmed.slice(colon + 1));
  }
  return values;
}

function legacyMilestones(lines: string[], warnings: ParseWarning[]): string[] {
  const block = extractKeyBlock(lines, 'milestones');
  if (!block) return [];
  const loaded = loadYaml(block.text, block.line);
  const value = loaded.ok && isRecord(loaded.value) ? loaded.value.milestones : undefined;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && typeof item !== 'object')
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' || typeof value === 'number') return [String(value).trim()].filter(Boolean);
  if (value !== null) {
    warnings.push({
      code: 'unreadable_legacy_milestones',
      message: `milestones could not be read and was skipped${atLine(block.line)}`,
      field: 'milestones',
      line: block.line,
    });
  }
  return [];
}

/**
 * Reads backlog/config.yml. Scalar keys are read line by line and list keys block by block, the way
 * Backlog.md reads them, so a config Backlog.md accepts is accepted here even when it is not valid
 * YAML as a whole. Fails only where Backlog.md refuses to start: a list key that is not a list or not
 * YAML, and a task_prefix that is not letters only.
 */
export function parseConfig(text: string): ParseResult<BacklogConfig> {
  const normalized = normalizeText(text);
  const lines = normalized.split('\n');
  const warnings: ParseWarning[] = [];
  const config = defaultConfig();

  for (const key of ['statuses', 'labels', 'priorities'] as const) {
    const read = readListKey(normalized, lines, key);
    if (!read.ok)
      return { ok: false, error: { code: 'invalid_config', message: read.message, line: read.line } };
    if (read.value === undefined) continue;
    if (key === 'statuses' && read.value.length > 0) config.statuses = read.value;
    if (key === 'labels') config.labels = read.value;
    if (key === 'priorities' && read.value.length > 0) config.priorities = read.value;
  }

  const scalars = scalarLines(lines);
  const read = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = scalars.get(key);
      if (value !== undefined) return scalarValue(value);
    }
    return undefined;
  };

  config.projectName = read('project_name') || null;
  config.defaultStatus = read('default_status') || null;
  const zeroPadded = Number.parseInt(read('zero_padded_ids') ?? '', 10);
  config.zeroPaddedIds = Number.isFinite(zeroPadded) ? zeroPadded : null;
  const directory = read('backlog_directory', 'backlogDirectory');
  config.backlogDirectory = directory ? normalizeDirectory(directory) : null;

  const prefix = read('task_prefix');
  if (prefix) {
    const upper = prefix.toUpperCase();
    if (!/^[A-Z]+$/.test(upper) || RESERVED_PREFIXES.has(upper)) {
      const line = lines.findLastIndex((line) => /^\s*task_prefix\s*:/.test(line)) + 1;
      return {
        ok: false,
        error: {
          code: 'invalid_config',
          message: `task_prefix must be letters only and not draft, doc or decision${atLine(line || undefined)}`,
          ...(line > 0 && { line }),
        },
      };
    }
    config.taskPrefix = upper;
  }

  config.legacyMilestones = legacyMilestones(lines, warnings);

  const whole = loadYaml(normalized);
  if (whole.ok && isRecord(whole.value)) {
    config.raw = whole.value;
  } else if (!whole.ok) {
    warnings.push({
      code: 'unreadable_raw_config',
      message: `config.yml is not valid YAML as a whole; read key by key instead: ${whole.reason}${atLine(whole.line)}`,
      ...(whole.line !== undefined && { line: whole.line }),
    });
  }

  return { ok: true, value: config, warnings };
}

/**
 * Reads a root backlog.config.yml for backlog_directory and project_name. Line-based, like
 * Backlog.md, so it never fails on content.
 */
export function parseRootConfig(text: string): ParseResult<RootConfig> {
  const scalars = scalarLines(normalizeText(text).split('\n'));
  const value = (key: string) => {
    const raw = scalars.get(key);
    return raw === undefined ? '' : scalarValue(raw);
  };
  const directory = value('backlog_directory') || value('backlogDirectory');
  return {
    ok: true,
    value: {
      backlogDirectory: directory ? normalizeDirectory(directory) : null,
      projectName: value('project_name') || value('projectName') || null,
    },
    warnings: [],
  };
}
