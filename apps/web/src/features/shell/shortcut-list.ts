// The keyboard shortcut list (?), from .agent/design/m5/shortcuts.md. On Windows and Linux ⌘ reads Ctrl.

export interface ShortcutRow {
  /** Chips in order. */
  keys: readonly string[];
  /** How the chips join: `seq` for sequences (G then H), `or` for alternatives (J / K), `to` for ranges (1–6). */
  join?: 'seq' | 'or' | 'to';
  action: string;
}

export interface ShortcutGroup {
  id: string;
  title: string;
  rows: readonly ShortcutRow[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: 'global',
    title: 'Global',
    rows: [
      { keys: ['⌘K'], action: 'Command palette' },
      { keys: ['C'], action: 'New task in the current project' },
      { keys: ['/'], action: 'Search the current view' },
      { keys: ['G', 'H'], join: 'seq', action: 'Go to Home' },
      { keys: ['G', 'P'], join: 'seq', action: 'Jump to a project' },
      { keys: ['G', 'L'], join: 'seq', action: "Current project's List" },
      { keys: ['G', 'B'], join: 'seq', action: "Current project's Board" },
      { keys: ['G', 'M'], join: 'seq', action: "Current project's Milestones" },
      { keys: ['G', 'Y'], join: 'seq', action: "Current project's Cycles" },
      { keys: ['['], action: 'Collapse or expand the sidebar' },
      { keys: ['?'], action: 'Keyboard shortcuts' },
    ],
  },
  {
    id: 'lists',
    title: 'Lists and boards',
    rows: [
      { keys: ['J', 'K'], join: 'or', action: 'Next or previous row or card' },
      { keys: ['←', '→'], join: 'or', action: 'Previous or next column, or collapse and expand a group' },
      { keys: ['X'], action: 'Select or unselect' },
      { keys: ['⇧↓', '⇧↑'], join: 'or', action: 'Extend the selection' },
      { keys: ['⌘A'], action: 'Select everything in the view' },
      { keys: ['Space'], action: 'Peek' },
      { keys: ['↵'], action: 'Open the task view' },
      { keys: ['Esc'], action: 'Clear the selection' },
      { keys: ['V'], action: 'Switch between list and board' },
    ],
  },
  {
    id: 'task',
    title: 'A selected or open task',
    rows: [
      { keys: ['S'], action: 'Status' },
      { keys: ['P'], action: 'Priority' },
      { keys: ['A'], action: 'Assignee' },
      { keys: ['I'], action: 'Assign to me' },
      { keys: ['L'], action: 'Labels' },
      { keys: ['⇧D'], action: 'Due date' },
      { keys: ['⇧M'], action: 'Milestone' },
      { keys: ['⇧C'], action: 'Cycle' },
      { keys: ['⇧B'], action: 'Add blocker' },
      { keys: ['⇧S'], action: 'Add subtask' },
      { keys: ['M'], action: 'Comment' },
      { keys: ['⌘C'], action: 'Copy the task key' },
      { keys: ['⌘⇧C'], action: 'Copy the link' },
    ],
  },
  {
    id: 'task-view',
    title: 'Task view',
    rows: [
      { keys: ['J', 'K'], join: 'or', action: 'Next or previous task in the list you came from' },
      { keys: ['Esc'], action: 'Back to the list or board' },
      { keys: ['E'], action: 'Edit the title' },
      { keys: ['D'], action: 'Edit the description' },
    ],
  },
  {
    id: 'menus',
    title: 'Pickers and menus',
    rows: [
      { keys: ['↑', '↓'], join: 'or', action: 'Move' },
      { keys: ['↵'], action: 'Pick, or toggle in multi-pick menus' },
      { keys: ['1', '6'], join: 'to', action: 'Status in the status picker' },
      { keys: ['0', '4'], join: 'to', action: 'Priority in the priority picker' },
      { keys: ['⌘↵'], action: 'Create a subtask from the typed text' },
      { keys: ['⌫'], action: 'Back out of a palette step' },
    ],
  },
  {
    id: 'dialogs',
    title: 'Dialogs and the comment box',
    rows: [
      { keys: ['⌘↵'], action: 'Submit' },
      { keys: ['Esc'], action: 'Cancel' },
      { keys: ['@'], action: 'Mention someone' },
    ],
  },
];

/** Single keys never fire in text fields; G then D and G then M changed meaning in M5. */
export const SHORTCUT_NOTES: readonly string[] = [
  'Single keys do nothing while you type in a field. Esc leaves the field first.',
  'Changed in 0.7.0: P sets the priority (it no longer opens New project), G then M opens Milestones, and Home replaces the dashboard and My tasks (G then H).',
];
