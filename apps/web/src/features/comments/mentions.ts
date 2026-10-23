// Mentions in comment bodies. The stored form is a Markdown link with a custom scheme:
// [@Ana Ruiz](mention:<userId>). The composer inserts that form from the picker; the server rewrites plain
// @agent-name and @email written through the API. Rendering keeps only mention: and http(s) links.

export const MENTION_SCHEME = 'mention:';

export interface MentionQuery {
  /** Index of the @ in the text. */
  start: number;
  /** Text typed after the @, up to the caret. */
  query: string;
}

/**
 * The @word being typed right before the caret, if any: "@cl" in "Can you @cl|". The @ must start the
 * text or follow whitespace or an opening bracket, so emails ("ana@example.com") do not open the picker.
 */
export function mentionAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = /(^|[\s([])@([^\s@[\]()]{0,40})$/.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: before.length - query.length - 1, query };
}

/** Link text cannot hold unescaped brackets. */
function escapeLinkText(text: string): string {
  return text.replace(/[[\]\\]/g, (char) => `\\${char}`);
}

/** The stored form of a mention: "[@Ana Ruiz](mention:<id>)". */
export function mentionMarkdown(member: { id: string; name: string }): string {
  return `[@${escapeLinkText(member.name)}](${MENTION_SCHEME}${member.id})`;
}

/** Replaces the @query before the caret with the mention link and a space. Returns the new text and caret. */
export function insertMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  member: { id: string; name: string },
): { text: string; caret: number } {
  const link = `${mentionMarkdown(member)} `;
  const end = Math.max(caret, mention.start + 1 + mention.query.length);
  const after = text.slice(end).replace(/^ /, '');
  return { text: text.slice(0, mention.start) + link + after, caret: mention.start + link.length };
}

/** The user id of a mention: link, or null for any other URL. */
export function mentionId(href: string | undefined | null): string | null {
  if (!href?.toLowerCase().startsWith(MENTION_SCHEME)) return null;
  const id = href.slice(MENTION_SCHEME.length).trim();
  return id || null;
}

/**
 * react-markdown's urlTransform for comments: keeps mention: and http(s) links, drops everything else
 * (javascript:, data:, relative paths) by returning an empty string.
 */
export function commentUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (/^mention:/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}
