// Mentions in comment bodies. Stored bodies keep them as Markdown links with a custom scheme,
// [@Ana Ruiz](mention:<userId>). API callers (the CLI included) may also write @agent-name or
// @email; core rewrites those to the link form before saving. Only members of the actor's
// workspace count: a mention link to anyone else loses its link and keeps its text. Nothing inside
// code (inline spans or fenced blocks) is read or rewritten.
import { type DbOrTx, schema } from '@zamu/db';
import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

export const MENTION_SCHEME = 'mention:';

/** The stored form of a mention: [@Name](mention:<userId>), with Markdown brackets escaped. */
export function formatMention(name: string, userId: string): string {
  return `[@${name.replace(/[\\[\]]/g, (char) => `\\${char}`)}](${MENTION_SCHEME}${userId})`;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/** A piece of a body. Only `text` segments may be rewritten. */
type Segment =
  | { type: 'code'; raw: string }
  /** Any other link, autolink or image: left alone, including its text. */
  | { type: 'link'; raw: string }
  /** A link with the mention: scheme. `label` is the raw text between the brackets. */
  | { type: 'mention'; raw: string; label: string; target: string }
  | { type: 'text'; raw: string };

/** A fence opener or closer, after any blockquote markers, list markers and indentation. */
const FENCE = /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)*(`{3,}|~{3,})(.*)$/;

/** Splits a body into fenced code blocks and the prose between them. */
export function splitFences(body: string): Segment[] {
  const segments: Segment[] = [];
  const lines = body.split(/(?<=\n)/);
  let prose = '';
  let code = '';
  let fence: { char: string; length: number } | null = null;
  for (const line of lines) {
    const match = FENCE.exec(line.replace(/\r?\n$/, ''));
    if (fence) {
      code += line;
      const [, marker, rest] = match ?? [];
      if (marker && marker[0] === fence.char && marker.length >= fence.length && !rest?.trim()) {
        segments.push({ type: 'code', raw: code });
        code = '';
        fence = null;
      }
      continue;
    }
    const [, marker, info] = match ?? [];
    // A backtick fence's info string cannot contain backticks (CommonMark).
    if (marker && !(marker[0] === '`' && info?.includes('`'))) {
      if (prose) segments.push({ type: 'text', raw: prose });
      prose = '';
      code = line;
      fence = { char: marker[0] as string, length: marker.length };
      continue;
    }
    prose += line;
  }
  // An unclosed fence runs to the end of the body.
  if (fence) segments.push({ type: 'code', raw: code });
  if (prose) segments.push({ type: 'text', raw: prose });
  return segments;
}

/** [label](destination "optional title"), with backslash escapes in both parts. */
const LINK = /!?\[((?:[^[\]\\]|\\.)*)\]\(\s*((?:[^()\s\\]|\\.)*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/sy;
/** <scheme:...> and <user@host> autolinks. */
const AUTOLINK =
  /<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)>/y;

const BACKTICKS = /`+/y;

/** Matches a sticky regex at `index`. */
function matchAt(pattern: RegExp, text: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(text);
}

/** Splits prose into inline code spans, links and plain text. */
export function splitInline(prose: string): Segment[] {
  const segments: Segment[] = [];
  let text = '';
  const flush = () => {
    if (text) segments.push({ type: 'text', raw: text });
    text = '';
  };
  let i = 0;
  while (i < prose.length) {
    const char = prose[i] as string;
    if (char === '\\' && i + 1 < prose.length) {
      text += prose.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (char === '`') {
      const run = matchAt(BACKTICKS, prose, i)?.[0] as string;
      // A code span closes at the next backtick run of exactly the same length.
      const closer = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
      closer.lastIndex = i + run.length;
      const end = closer.exec(prose);
      if (end) {
        flush();
        segments.push({ type: 'code', raw: prose.slice(i, end.index + run.length) });
        i = end.index + run.length;
      } else {
        // No closer: the backticks are literal text.
        text += run;
        i += run.length;
      }
      continue;
    }
    if (char === '[' || (char === '!' && prose[i + 1] === '[')) {
      const match = matchAt(LINK, prose, i);
      if (match) {
        flush();
        const [raw, label = '', destination = ''] = match;
        if (char === '[' && destination.toLowerCase().startsWith(MENTION_SCHEME)) {
          segments.push({ type: 'mention', raw, label, target: destination.slice(MENTION_SCHEME.length) });
        } else {
          segments.push({ type: 'link', raw });
        }
        i += raw.length;
        continue;
      }
    }
    if (char === '<') {
      const match = matchAt(AUTOLINK, prose, i);
      if (match) {
        flush();
        segments.push({ type: 'link', raw: match[0] });
        i += match[0].length;
        continue;
      }
    }
    text += char;
    i += 1;
  }
  flush();
  return segments;
}

function scan(body: string): Segment[] {
  return splitFences(body).flatMap((segment) =>
    segment.type === 'text' ? splitInline(segment.raw) : [segment],
  );
}

/**
 * A plain mention in text: @ after a boundary, then an email or an agent-name slug.
 * The boundary rules out emails (ana@x), URL paths (/@ana) and escapes (\@ana).
 */
const PLAIN_MENTION =
  /(?<![A-Za-z0-9_\\/@.+-])@(?:([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)|([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*))(?![A-Za-z0-9_@]|-[A-Za-z0-9])/g;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The user ids a stored body mentions, in order of first mention. Reads mention: links outside
 * code only, like the renderer does.
 */
export function mentionedUserIds(body: string): string[] {
  const ids: string[] = [];
  for (const segment of scan(body)) {
    if (segment.type !== 'mention') continue;
    const id = segment.target.toLowerCase();
    if (UUID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Resolving and rewriting
// ---------------------------------------------------------------------------

interface MentionCandidate {
  id: string;
  name: string;
  kind: 'person' | 'agent';
  email: string;
}

/** The workspace members matching any of the ids, emails (people) or agent names. */
async function findMembers(
  db: DbOrTx,
  workspaceId: string,
  wanted: { ids: Set<string>; emails: Set<string>; agentNames: Set<string> },
): Promise<MentionCandidate[]> {
  const { user, member } = schema;
  const matches: SQL[] = [];
  if (wanted.ids.size > 0) matches.push(inArray(user.id, [...wanted.ids]));
  if (wanted.emails.size > 0) {
    // Agent emails are synthetic, so @email only names people.
    matches.push(and(eq(user.kind, 'person'), inArray(sql`lower(${user.email})`, [...wanted.emails])) as SQL);
  }
  if (wanted.agentNames.size > 0) {
    matches.push(and(eq(user.kind, 'agent'), inArray(user.name, [...wanted.agentNames])) as SQL);
  }
  if (matches.length === 0) return [];
  return db
    .select({ id: user.id, name: user.name, kind: user.kind, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), or(...matches)));
}

export interface ResolvedMentions {
  /** The body with every mention in link form and links to non-members reduced to their text. */
  body: string;
  /** Mentioned members, in order of first mention. */
  userIds: string[];
}

/**
 * Rewrites the mentions in a Markdown comment body for the workspace:
 * - [@Name](mention:id) stays a link when `id` is a member (its label is refreshed to the member's
 *   name); otherwise the link is dropped and its text kept.
 * - @agent-name (agent names are unique slugs) and @email (people) become links to the member.
 * - Any other @word, and anything inside code spans, fenced code or other links, is left alone.
 */
export async function resolveMentions(
  db: DbOrTx,
  workspaceId: string,
  body: string,
): Promise<ResolvedMentions> {
  const segments = scan(body);

  const wanted = { ids: new Set<string>(), emails: new Set<string>(), agentNames: new Set<string>() };
  for (const segment of segments) {
    if (segment.type === 'mention' && UUID.test(segment.target)) wanted.ids.add(segment.target.toLowerCase());
    if (segment.type !== 'text') continue;
    for (const [, email, slug] of segment.raw.matchAll(PLAIN_MENTION)) {
      if (email) wanted.emails.add(email.toLowerCase());
      if (slug) wanted.agentNames.add(slug.toLowerCase());
    }
  }

  const members = await findMembers(db, workspaceId, wanted);
  const byId = new Map(members.map((row) => [row.id, row]));
  const byEmail = new Map(
    members.filter((row) => row.kind === 'person').map((row) => [row.email.toLowerCase(), row]),
  );
  const byAgentName = new Map(members.filter((row) => row.kind === 'agent').map((row) => [row.name, row]));

  const userIds: string[] = [];
  const mention = (row: MentionCandidate) => {
    if (!userIds.includes(row.id)) userIds.push(row.id);
    return formatMention(row.name, row.id);
  };

  const rewritten = segments.map((segment) => {
    if (segment.type === 'code' || segment.type === 'link') return segment.raw;
    if (segment.type === 'mention') {
      const row = UUID.test(segment.target) ? byId.get(segment.target.toLowerCase()) : undefined;
      return row ? mention(row) : segment.label;
    }
    return segment.raw.replace(PLAIN_MENTION, (raw, email: string | undefined, slug: string | undefined) => {
      const row = email ? byEmail.get(email.toLowerCase()) : byAgentName.get((slug as string).toLowerCase());
      return row ? mention(row) : raw;
    });
  });

  return { body: rewritten.join(''), userIds };
}
