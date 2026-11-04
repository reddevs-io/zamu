import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The command palette's registry (M5). Screens register the actions that make sense where they are
 * (the selected tasks' fields, the view's switches); the palette (features/palette, M5-07) lists them
 * with the built-in pages, projects and task search.
 *
 * The contract between workstreams is this file: M5-07 renders it, M5-08 and M5-09 register into it.
 * Keep it small; change it only from the primary session.
 */

export type CommandSection =
  /** Acting on the selected or open tasks: Set status, Assign to me. */
  | 'task'
  /** The current view: Switch to board, Display options, Filter. */
  | 'view'
  /** Create task, Create project. */
  | 'create'
  /** Go to Home, a project, Milestones. */
  | 'navigate'
  /** Switch theme, Toggle sidebar, Keyboard shortcuts. */
  | 'app';

export interface Command {
  /** Stable and unique among registered commands: 'task.status', 'view.toggle-layout'. */
  id: string;
  title: string;
  section: CommandSection;
  /** Extra words that match the search: ['state', 'move']. */
  keywords?: readonly string[];
  /** The shortcut shown next to it, written as in useHotkeys: 's', 'Shift+d', 'g h'. */
  shortcut?: string;
  /** "3 selected" or "PAY-142": who the action applies to, shown as the step's context pill. */
  context?: string;
  /** Shown dimmed and not runnable, with the reason as its tip ("Read-only: mirrored from Backlog.md"). */
  disabledReason?: string;
  /** Glyph before the title (a StatusGlyph, a project tile). Decorative. Added by M5-07. */
  icon?: ReactNode;
  /** Muted text on the right: the project of a task, "Project". Added by M5-07. */
  hint?: string;
  /** The current value in a step (the task's status): drawn with a check. Added by M5-07. */
  checked?: boolean;
  /**
   * Run the command. Return nothing to close the palette, or a step (a list of child commands, such
   * as the six statuses) to show next, with this command's title as the crumb.
   */
  run: () => undefined | PaletteStep | Promise<undefined | PaletteStep>;
  /**
   * The same action on the typed text (frame 090's Actions: Create task “offline”). The palette lists it
   * under Actions while searching, titled `title(text)`, and runs `run(text)`.
   */
  withText?: { title: (text: string) => string; run: (text: string) => void };
}

export interface PaletteStep {
  /** The crumb: "Set status". */
  title: string;
  placeholder?: string;
  commands: readonly Command[];
}

/** What the palette shows when it opens. */
export type PaletteOpenMode =
  | { kind: 'all' }
  /** G then P: only projects. */
  | { kind: 'projects' }
  /** Open straight into a step: S on a selection with the palette as the fallback picker. */
  | { kind: 'step'; step: PaletteStep };

interface PaletteState {
  open: PaletteOpenMode | null;
  /** Registration order is kept; later registrations of the same id replace earlier ones. */
  commands: ReadonlyMap<string, Command>;
}

let state: PaletteState = { open: null, commands: new Map() };
const listeners = new Set<() => void>();

function setState(next: PaletteState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Open the palette (⌘K, G then P, or a fallback step). */
export function openPalette(mode: PaletteOpenMode = { kind: 'all' }) {
  setState({ ...state, open: mode });
}

export function closePalette() {
  if (state.open) setState({ ...state, open: null });
}

/** The palette's open mode, or null when closed. For the palette component and tests. */
export function usePaletteOpen(): PaletteOpenMode | null {
  return useSyncExternalStore(
    subscribe,
    () => state.open,
    () => null,
  );
}

/** Every registered command, in registration order. */
export function useRegisteredCommands(): readonly Command[] {
  const commands = useSyncExternalStore(
    subscribe,
    () => state.commands,
    () => state.commands,
  );
  return [...commands.values()];
}

/**
 * Register commands while the calling component is mounted. Pass a new array whenever the commands
 * change (selection, task state); registration is updated in place, and removed on unmount.
 */
export function useRegisterCommands(commands: readonly Command[]) {
  const ids = useRef<string[]>([]);
  useEffect(() => {
    const next = new Map(state.commands);
    for (const id of ids.current) next.delete(id);
    for (const command of commands) next.set(command.id, command);
    ids.current = commands.map((command) => command.id);
    setState({ ...state, commands: next });
  }, [commands]);
  useEffect(
    () => () => {
      const next = new Map(state.commands);
      for (const id of ids.current) next.delete(id);
      ids.current = [];
      setState({ ...state, commands: next });
    },
    [],
  );
}

/** Test helper: forget every command and close the palette. */
export function resetPaletteForTests() {
  setState({ open: null, commands: new Map() });
}
