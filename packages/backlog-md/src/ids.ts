import type { BacklogId } from './types';

const TASK_ID_PATTERN = /^(?:([A-Za-z]+)-)?(\d+(?:\.\d+)*)$/;

function canonicalSegment(segment: string): string {
  return segment.replace(/^0+(?=\d)/, '');
}

/**
 * Reads a Backlog.md task ID: case-insensitive prefix, dotted subtask numbers, zero padding ignored.
 * A bare number takes `defaultPrefix`. Returns null for anything else (non-numeric bodies, empty
 * segments, numbers too large to be exact).
 *
 * parseBacklogId('back-007.01') -> { id: 'BACK-7.1', prefix: 'BACK', number: 7, suffix: '1' }
 */
export function parseBacklogId(value: string, defaultPrefix?: string): BacklogId | null {
  const match = value.trim().match(TASK_ID_PATTERN);
  if (!match) return null;
  const prefix = (match[1] ?? defaultPrefix ?? '').toUpperCase();
  if (!/^[A-Z]+$/.test(prefix)) return null;
  const segments = (match[2] ?? '').split('.').map(canonicalSegment);
  const number = Number(segments[0]);
  if (!Number.isSafeInteger(number)) return null;
  const rest = segments.slice(1);
  if (rest.some((segment) => !Number.isSafeInteger(Number(segment)))) return null;
  const suffix = rest.length > 0 ? rest.join('.') : null;
  return { id: `${prefix}-${number}${suffix ? `.${suffix}` : ''}`, prefix, number, suffix };
}

/** Canonical ID when the value parses, else the value as written (trimmed). */
export function canonicalTaskRef(value: string, defaultPrefix?: string): string {
  return parseBacklogId(value, defaultPrefix)?.id ?? value.trim();
}

/** ID part of a "<id> - <title>.md" file name, e.g. "back-12.1". */
export function idFromFileName(fileName: string): string | null {
  return fileName.match(/^([A-Za-z]+-\d+(?:\.\d+)*)(?: - |\.md$)/)?.[1] ?? null;
}

/** Title part of a "<id> - <title>.md" file name, dashes read as spaces. */
export function titleFromFileName(fileName: string): string | null {
  const title = fileName
    .match(/^[^ ]+ - (.+)\.md$/)?.[1]
    ?.replace(/-/g, ' ')
    .trim();
  return title || null;
}

export interface MilestoneId {
  /** m-3: lowercase, no zero padding. */
  id: string;
  number: number;
}

/** Reads "m-3", "M-03" or a bare "3". */
export function parseMilestoneId(value: string): MilestoneId | null {
  const match = value.trim().match(/^(?:m-)?(\d+)$/i);
  if (!match?.[1]) return null;
  const number = Number(canonicalSegment(match[1]));
  if (!Number.isSafeInteger(number)) return null;
  return { id: `m-${number}`, number };
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
