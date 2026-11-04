import type { Member } from '@pm/contracts';
import {
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Avatar,
  filterPickerItems,
  movePickerActive,
  type PickerItem,
  PickerList,
  pickerOptionId,
} from '~/ui';
import { insertMention, mentionAt } from './mentions';

// The @mention picker of the composer and the comment editor. Focus stays in the textarea: arrow keys
// move the highlighted member, Enter or Tab inserts [@Name](mention:id), Esc closes the list.

const MAX_MATCHES = 8;

/** What the picker puts on the textarea (combobox wiring). */
export type ComposerTextAreaAttributes = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'aria-activedescendant' | 'aria-controls' | 'aria-expanded' | 'aria-autocomplete' | 'role'
>;

export const MENTION_FOOTER = 'No notifications yet. A mention links to the member.';

export interface MentionCandidate extends PickerItem {
  name: string;
}

/** First name of a person, for "claude-dev for Ana". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** People and agents of the workspace as picker rows (frame 058): "claude-dev  for Ana". */
export function mentionCandidates(members: readonly Member[]): MentionCandidate[] {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    label: member.name,
    textValue: member.email ? `${member.name} ${member.email}` : member.name,
    ...(member.kind === 'agent' && member.responsible
      ? { sub: `for ${firstName(member.responsible.name)}` }
      : {}),
    lead: <Avatar name={member.name} kind={member.kind} decorative />,
  }));
}

export interface MentionPicker {
  /** True while the list shows. */
  isOpen: boolean;
  /** Pass to the textarea (Composer textAreaRef / CommentEditor textAreaRef). */
  textAreaRef: (element: HTMLTextAreaElement | null) => void;
  /** Runs before the composer's keys; handles arrows, Enter, Tab and Esc while the list is open. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  textAreaProps: ComposerTextAreaAttributes;
  /** The list, positioned above the text box. Null while closed. */
  overlay: ReactNode;
  /** Focuses the textarea. */
  focus: () => void;
  /** Use as the text box's onChange: tracks the caret, then calls the given onChange. */
  onChange: (value: string) => void;
}

export interface UseMentionPickerOptions {
  value: string;
  onChange: (value: string) => void;
  members: readonly Member[];
  /** Off while the composer shows Preview. */
  enabled?: boolean;
  /** Classes that place the list (default: above the box, left aligned). */
  overlayClassName?: string;
}

export function useMentionPicker({
  value,
  onChange,
  members,
  enabled = true,
  overlayClassName = 'absolute bottom-full left-0 mb-1 w-80',
}: UseMentionPickerOptions): MentionPicker {
  const listId = useId();
  const element = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The @ position the person closed with Esc; the list stays closed for that mention.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const candidates = useMemo(() => mentionCandidates(members), [members]);
  const mention = enabled && hasFocus && caret != null ? mentionAt(value, caret) : null;
  const isOpen = mention != null && mention.start !== dismissed;
  const matches = isOpen ? filterPickerItems(candidates, mention.query).slice(0, MAX_MATCHES) : [];
  const active = matches.find((item) => item.id === activeId)?.id ?? matches[0]?.id ?? null;

  // A new @ (another position) may open again after Esc.
  useEffect(() => {
    if (dismissed != null && mention?.start !== dismissed) setDismissed(null);
  }, [dismissed, mention?.start]);

  const listeners = useRef<(() => void) | null>(null);
  const textAreaRef = useCallback((node: HTMLTextAreaElement | null) => {
    listeners.current?.();
    listeners.current = null;
    element.current = node;
    if (!node) return;
    const track = () => setCaret(node.selectionStart);
    const focus = () => {
      setHasFocus(true);
      track();
    };
    const blur = () => setHasFocus(false);
    // Caret moves without typing (arrows, clicks, selection). Typing goes through `onChange` below:
    // a state update from a native input listener, ahead of React's own, would undo the keystroke.
    const events = ['keyup', 'click', 'select'] as const;
    for (const name of events) node.addEventListener(name, track);
    node.addEventListener('focus', focus);
    node.addEventListener('blur', blur);
    if (node.ownerDocument.activeElement === node) focus();
    listeners.current = () => {
      for (const name of events) node.removeEventListener(name, track);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', blur);
    };
  }, []);

  // After an insert, the caret goes right after the mention once React has written the new text.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (pendingCaret.current == null || !node || node.value !== value) return;
    const at = pendingCaret.current;
    pendingCaret.current = null;
    node.focus();
    node.setSelectionRange(at, at);
  }, [value]);

  const insert = (id: string) => {
    const member = candidates.find((item) => item.id === id);
    if (!member || !mention || caret == null) return;
    const next = insertMention(value, mention, caret, member);
    pendingCaret.current = next.caret;
    onChange(next.text);
    setCaret(next.caret);
    setActiveId(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveId(movePickerActive(matches, active, event.key === 'ArrowDown' ? 1 : -1));
    } else if (
      (event.key === 'Enter' || event.key === 'Tab') &&
      active &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      insert(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(mention.start);
    }
  };

  const overlay = isOpen ? (
    <PickerList
      id={listId}
      aria-label="Mention"
      title="Mention"
      items={matches}
      activeId={active}
      onActiveChange={setActiveId}
      onSelect={insert}
      emptyText="No member matches"
      className={overlayClassName}
    />
  ) : null;

  return {
    isOpen,
    textAreaRef,
    onKeyDown,
    textAreaProps: {
      'aria-autocomplete': 'list',
      'aria-expanded': isOpen,
      'aria-controls': isOpen ? listId : undefined,
      'aria-activedescendant': isOpen && active ? pickerOptionId(listId, active) : undefined,
    },
    overlay,
    focus: () => element.current?.focus(),
    onChange: (next: string) => {
      setCaret(element.current?.selectionStart ?? next.length);
      onChange(next);
    },
  };
}
