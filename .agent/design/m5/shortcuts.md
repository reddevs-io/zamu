# Keyboard shortcuts (M5, as designed)

Single keys, Linear-style. Hints appear in tooltips, menus and the command palette, never as permanent labels. On Windows and Linux, ⌘ is Ctrl.

**Rules for every key below:**
- Single keys do nothing while focus is in a text field, the comment box or a picker's search input. Esc leaves the field first.
- Esc closes the topmost layer first, in this order: picker or menu, palette, dialog, peek, selection. Then it goes back.
- Keys match the character typed (`event.key`), not the physical key, so they follow the person's keyboard layout. The exception is `[` (see conflict 5).

## Global

| Key | Action |
|---|---|
| ⌘K | Command palette |
| C | New task in the current project (quick create) |
| / | Search the current view |
| G then H | Go to Home |
| G then P | Jump to a project (opens the palette filtered to projects) |
| G then L | Current project's List |
| G then B | Current project's Board |
| G then M | Current project's Milestones |
| G then Y | Current project's Cycles |
| [ | Collapse or expand the sidebar |
| ? | Keyboard shortcuts |

## Lists and boards

| Key | Action |
|---|---|
| J / K or ↓ / ↑ | Next or previous row or card |
| ← / → on the board | Previous or next column |
| ← / → on a group row in the list | Collapse or expand the group |
| X | Select or unselect |
| Shift+↓ / Shift+↑ | Extend the selection |
| Shift+click | Select a range |
| ⌘A | Select everything in the view |
| Space | Peek. Space or Esc closes it, and J / K move it to the next task |
| Enter | Open the task view |
| Esc | Clear the selection |
| V | Switch between list and board |

## A selected or open task

With several tasks selected, these act on all of them, in native projects only (see notes.md).

| Key | Action |
|---|---|
| S | Status |
| P | Priority |
| A | Assignee |
| I | Assign to me |
| L | Labels |
| Shift+D | Due date |
| Shift+M | Milestone |
| Shift+C | Cycle |
| Shift+B | Add blocker |
| Shift+S | Add subtask |
| M | Comment |
| ⌘C | Copy the task key (or keys) |
| ⌘⇧C | Copy the link |

## Task view

| Key | Action |
|---|---|
| J / K | Next or previous task in the list you came from ("12 of 40 in List") |
| Esc | Back to the list or board, with the task still selected |
| E | Edit the title |
| D | Edit the description |

## Inside pickers and menus

| Key | Action |
|---|---|
| Type | Filter the list |
| ↑ / ↓ | Move |
| Enter | Pick. In multi-pick menus such as labels, it toggles |
| 1–6 in the status picker | Backlog, Todo, In progress, In review, Done, Canceled |
| 0–4 in the priority picker | None, Urgent, High, Medium, Low |
| ⌘Enter in the subtask picker | Create a new subtask from the typed text |
| ← / → in the due-date calendar | Previous or next day (↑ / ↓ move a week) |
| Tab in the label picker | Move to the colour swatches when creating a label |
| Backspace on an empty palette input | Back out of a palette step (such as Set status) |

## Dialogs and the comment box

| Key | Action |
|---|---|
| ⌘Enter | Submit (create the task, post the comment, save) |
| Esc | Cancel |
| @ | Mention someone in a comment |

## Conflicts found and how they are resolved

1. **G then P had no target.** The design has no Projects page, because the sidebar lists the projects. G then P opens the palette filtered to projects instead.
2. **Milestones and Cycles had no G shortcut.** G then M and G then Y fill the gap. C is taken by the cycle field, and Y reads as "cYcle". Drop them if two-key sequences should stay few.
3. **Number keys.** 1–6 and 0–4 work only inside the status and priority pickers, so they never clash with each other or with typing.
4. **⌘C.** It copies the key only when tasks are selected and no text is highlighted. With text highlighted, it copies the text, as the browser normally does.
5. **`[` on non-US layouts.** On German, French and Nordic layouts, `[` needs AltGr, which makes it awkward as a single key. Match it by physical key (`event.code === 'BracketLeft'`) so the key next to P works on every layout, and keep "Toggle sidebar" in the palette.
6. **E and D in the task view.** They are new: the brief had no key for editing the title or description. Both are free in that context. In lists, D is unused, and Shift+D (due date) is different.
7. **Shift+S in lists.** Add subtask stays task-scoped. With several tasks selected, Shift+S is disabled, because a subtask needs one parent.
8. **Space in the peek.** Space closes the peek only when focus is not in one of its fields. In mirrored projects the peek has no editable fields, so Space always closes it.
