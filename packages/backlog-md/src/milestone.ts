import { parseDueDate } from './dates';
import { FieldReader, readFrontmatter } from './frontmatter';
import { baseName, parseMilestoneId, titleFromFileName } from './ids';
import { parseDescription } from './sections';
import type { BacklogConfig, BacklogMilestone, ParseResult } from './types';
import { atLine } from './yaml';

const KNOWN_KEYS: ReadonlySet<string> = new Set(['id', 'title', 'due_date']);

/** Reads a milestones/ or archive/milestones/ file ("m-3 - title.md"). */
export function parseMilestone(path: string, text: string): ParseResult<BacklogMilestone> {
  const read = readFrontmatter(text);
  if (!read.ok) return read;
  const fields = new FieldReader(read.file);
  const fileName = baseName(path);
  const fileId = parseMilestoneId(fileName.match(/^(m-\d+)(?: - |\.md$)/i)?.[1] ?? '');

  const rawId = fields.text('id');
  let id = fileId;
  if (rawId !== null) {
    const parsed = parseMilestoneId(rawId);
    if (!parsed) {
      const line = fields.line('id');
      return {
        ok: false,
        error: {
          code: 'invalid_id',
          message: `id "${rawId}" is not a milestone ID like m-3${atLine(line)}`,
          ...(line !== undefined && { line }),
        },
      };
    }
    if (fileId && fileId.id !== parsed.id) {
      fields.warn(
        'id_mismatch',
        'id',
        `id ${parsed.id} differs from the file name's ${fileId.id}; the id wins`,
      );
    }
    id = parsed;
  }
  if (!id) {
    return {
      ok: false,
      error: {
        code: 'missing_id',
        message: 'no id in the frontmatter and none in the file name (line 2)',
        line: 2,
      },
    };
  }

  let title = fields.text('title');
  if (title === null) {
    title = titleFromFileName(fileName) ?? id.id;
    fields.warn('missing_title', 'title', `title is missing; using "${title}"`);
  }

  const dueRaw = fields.text('due_date');
  const dueDate = parseDueDate(dueRaw);
  if (dueDate === null)
    fields.warn('invalid_due_date', 'due_date', `due_date "${dueRaw}" is not a YYYY-MM-DD date`);

  return {
    ok: true,
    value: {
      path,
      id: id.id,
      number: id.number,
      title,
      description: parseDescription(read.file.body),
      dueDate: dueDate ?? null,
      legacy: false,
      unknown: fields.unknown(KNOWN_KEYS),
    },
    warnings: fields.warnings,
  };
}

/**
 * The legacy `milestones:` list of config.yml as milestone records (id and title are the name).
 * Backlog.md moves these into files on its next run; use them only when no milestone files exist.
 */
export function legacyConfigMilestones(config: BacklogConfig): BacklogMilestone[] {
  const seen = new Set<string>();
  const milestones: BacklogMilestone[] = [];
  for (const name of config.legacyMilestones) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    milestones.push({
      path: null,
      id: name.trim(),
      number: null,
      title: name.trim(),
      description: null,
      dueDate: null,
      legacy: true,
      unknown: {},
    });
  }
  return milestones;
}

export interface MilestoneCandidate {
  id: string;
  title: string;
  /** Archived milestones are tried after active ones. */
  archived?: boolean;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

function idAliases(value: string): Set<string> {
  const aliases = new Set<string>();
  const base = key(value);
  if (!base) return aliases;
  aliases.add(base);
  const numeric = parseMilestoneId(value);
  if (numeric) {
    aliases.add(String(numeric.number));
    aliases.add(numeric.id);
  }
  return aliases;
}

function findById<T extends MilestoneCandidate>(value: string, milestones: T[]): T | undefined {
  const input = key(value);
  const exact = milestones.find((milestone) => key(milestone.id) === input);
  if (exact) return exact;
  const aliases = idAliases(value);
  return milestones.find((milestone) => [...idAliases(milestone.id)].some((alias) => aliases.has(alias)));
}

function findUniqueTitle<T extends MilestoneCandidate>(value: string, milestones: T[]): T | undefined {
  const matches = milestones.filter((milestone) => key(milestone.title) === key(value));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Resolves a task's milestone value the way Backlog.md stores it: "m-7", "7" or "M-07" match by ID;
 * other values match a unique title, case-insensitive (or an ID written out in full). Active
 * milestones are tried before archived ones. Returns null when nothing matches or a title is
 * ambiguous.
 */
export function matchMilestone<T extends MilestoneCandidate>(
  value: string | null | undefined,
  milestones: T[],
): T | null {
  const input = value?.trim() ?? '';
  if (!input) return null;
  const active = milestones.filter((milestone) => !milestone.archived);
  const archived = milestones.filter((milestone) => milestone.archived);
  const looksLikeId = parseMilestoneId(input) !== null;

  if (looksLikeId) {
    return (
      findById(input, active) ??
      findById(input, archived) ??
      findUniqueTitle(input, active) ??
      (active.some((milestone) => key(milestone.title) === key(input))
        ? undefined
        : findUniqueTitle(input, archived)) ??
      null
    );
  }

  const activeTitles = active.filter((milestone) => key(milestone.title) === key(input));
  if (activeTitles.length > 1) return null;
  return (
    findUniqueTitle(input, active) ??
    findById(input, active) ??
    findUniqueTitle(input, archived) ??
    findById(input, archived) ??
    null
  );
}
