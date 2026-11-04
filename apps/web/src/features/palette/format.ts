import type { Command, CommandSection } from './registry';

/** Section headings of the palette, in display order. */
export const SECTION_ORDER: readonly CommandSection[] = ['task', 'view', 'create', 'navigate', 'app'];

export const SECTION_TITLES: Record<CommandSection, string> = {
  task: 'Task actions',
  view: 'View',
  create: 'Create',
  navigate: 'Go to',
  app: 'App',
};

const NAMED: Record<string, string> = {
  shift: '⇧',
  mod: '⌘',
  meta: '⌘',
  cmd: '⌘',
  ctrl: 'Ctrl',
  alt: '⌥',
  enter: '↵',
  escape: 'Esc',
  esc: 'Esc',
  backspace: '⌫',
  space: 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  'code:bracketleft': '[',
};

/**
 * Key chips for a command's shortcut, written as in useHotkeys: 's' → S, 'Shift+d' → ⇧ D, 'g h' → G H,
 * 'Mod+Enter' → ⌘ ↵.
 */
export function shortcutChips(shortcut: string | undefined): string[] {
  if (!shortcut) return [];
  const chips: string[] = [];
  for (const step of shortcut.trim().split(/\s+/)) {
    for (const part of step.split(/\+(?!$)/)) {
      const lower = part.toLowerCase();
      chips.push(NAMED[lower] ?? (part.length === 1 ? part.toUpperCase() : part));
    }
  }
  return chips;
}

/** True when every word of the query appears in the title or the keywords (case-insensitive). */
export function commandMatches(command: Pick<Command, 'title' | 'keywords'>, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [command.title, ...(command.keywords ?? [])].join(' ').toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

/** Higher for better matches: the title starts with the query, then a word of it does, then anything. */
export function commandScore(command: Pick<Command, 'title'>, query: string): number {
  const title = command.title.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return 0;
  if (title.startsWith(needle)) return 3;
  if (title.split(/[\s:·]+/).some((word) => word.startsWith(needle))) return 2;
  return title.includes(needle) ? 1 : 0;
}

/** Text the palette treats as a task key: PAY-142, pay-142, PAY-786.1. */
export function looksLikeTaskKey(query: string): boolean {
  return /^[a-z][a-z0-9]*-\d+(\.\d+)*$/i.test(query.trim());
}
