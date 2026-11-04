# Claude Design brief: M5 screens (labels, due dates, dependencies and subtasks)

Run this in the existing Claude Design project "project-management · M1", on a new canvas "M5 Screens" next to the M1 to M4 canvases, so it reuses `ledger.css`, `ledger-m2.css`, `ledger-m3.css`, `ledger-m4.css` and the existing components. To run it in a fresh project instead, upload these first and paste everything below the line:

- `.agent/design/m4/source/ledger.css`, `ledger-m2.css`, `ledger-m4.css` and `.agent/design/m3/source/ledger-m3.css`
- PNGs of the screens this release changes: `.agent/design/m2/screens/` (board, task detail, quick create, My tasks), `.agent/design/m3/screens/` 47 to 70 (mirrored list, board and task panel, project settings), `.agent/design/m4/screens/` (dashboard, at least the Mine scope and the Deadlines group)

---

Add four task fields to a web app whose screens already exist: labels, due dates, "blocked by" dependencies and subtasks. You don't need access to any code repository. Everything you need is in this brief and the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans. They get tasks assigned, update status, comment, and leave a trail. Every change shows who made it, and for agents, which human they act for ("claude-dev, acting for Ana").

Audience: developers. They work fast, use the keyboard, and want dense, readable views over decoration. The look is calm and neutral, not playful, with one accent color.

## Starting point

The app follows the "Ledger" direction: a left rail, a main pane, and a task side panel that opens on the right. Tokens and component styles are in `ledger.css` and the per-release sheets. Existing screens: dashboard, My tasks, projects, a project's task list (grouped by status) and board, milestones, cycles, the task side panel with comments and history, quick create, project settings (General, Backlog.md), workspace settings.

- Keep the Ledger direction, its tokens and its components. Add tokens only where these fields need them, and list every addition.
- Reuse the existing task row, chips, status and priority icons, progress bar, pickers, avatars (with the quiet agent glyph), the read-only lock treatment for mirrored fields, and the empty, loading and error patterns.

## Constraints

- Built in React with React Aria. No component kit is imposed.
- Light and dark themes are both first-class.
- Desktop first. It must work at 1280px and stay usable at 1024px with the side panel open. Mobile layouts are not needed.
- Keyboard first. Existing shortcuts: C creates a task, P creates a project, / searches, V switches list and board, J/K and the arrow keys move between rows, Left collapses a group and Right expands it, Enter opens, Esc closes, G then a letter goes to a page; in the task panel Shift+M sets the milestone and Shift+C the cycle. Propose shortcuts for setting labels and the due date, and for adding a blocker or a subtask, and list every shortcut the release adds.
- Accessible contrast (WCAG AA) in both themes. Never use color as the only signal: label colors always come with the label's name, and overdue and blocked need a word or a glyph besides color.
- Dense rows: the task list row must stay one line at 1280px with every field set.

## Domain

- Workspace: contains projects and members. Member: a human or an agent.
- Project: name plus a short uppercase key, e.g. "Payments" with key PAY.
- Task: key (PAY-42), title, description, status, priority, assignee, milestone, cycle, and now labels, due date, blockers and subtasks.
- Statuses: Backlog, Todo, In progress, In review, Done, Canceled. Open means not Done and not Canceled.
- Priorities: None, Low, Medium, High, Urgent.
- Some projects are read-only mirrors of a git repository's Backlog.md task files. Their fields can't be edited in the app; a lock marks them. Today their labels, dependencies, parent, subtasks and due date sit in a read-only "Backlog.md" block in the panel.

### The four fields

**Labels**
- Belong to one project. Typing a name that doesn't exist creates it in that project, as Backlog.md does. Names are unique per project, case-insensitive, up to 40 characters.
- Each label has a muted color picked from a small fixed palette (8 to 10 hues that work in both themes). The app picks one for a new label; people can change it.
- A task can have several labels (design for 0, 1, 3 and 8).
- Managed in a new "Labels" section of project settings: list with usage counts, rename, recolor, delete (with "Used on 12 tasks" in the confirm).
- Filter by label in the project list, the board and My tasks.

**Due date**
- An optional date (no time) per task.
- States: none; future ("Due Nov 4"); within 2 days ("Due tomorrow"); today; overdue ("3 days overdue"). Overdue counts only for open tasks; a done task with a past date shows the date quietly.
- Sort by due date in the list. Open tasks due within 2 days or overdue appear in the dashboard's Deadlines group, next to its milestone and cycle rows, under Mine for my tasks and my agents' tasks.

**Blocked by**
- A task can list other tasks of the same project that block it. The reverse is shown too ("Blocks PAY-50, PAY-51").
- A task with at least one open blocker shows a Blocked marker in the list, board and panel. Display only: status changes are never refused.
- Adding a link that would create a loop is refused with an explanation ("PAY-12 already waits on PAY-40").
- A blocker that was deleted or hidden reads "Removed task".

**Subtasks**
- One level only: a task can have child tasks in the same project; a child can't have children.
- The parent shows progress (done of total, canceled excluded) in the panel and as a compact marker in rows.
- In the panel: the list of children (key, title, status, assignee), add an existing task as a child, create a new child, remove a child from the parent.
- In the list grouped by status, children appear in their own status group like any task, with a quiet "↳ PAY-40" parent reference. Propose whether the list should also offer nesting under the parent; keep the default flat.

**Mirrored projects**
- A refresh fills the native labels, due date, blockers and parent from the files, so filters, markers and the dashboard work the same as in native projects. Everything stays read-only with the lock treatment.
- Labels used in the files appear in project settings as read-only, with "From Backlog.md".
- The Backlog.md block in the panel shrinks to the fields with no native home: type, reporter, references, documentation, modified files, created and updated dates as written, and unknown keys.
- Backlog.md subtask keys look like BACK-12.1 and BACK-12.2. Show them as they are.

## Screens

1. **Task panel, native task**: every field set (4 labels, overdue date, 2 open blockers, blocks 1, 5 subtasks with 3 done), light and dark. Then the same panel with nothing set: each field shows an inviting empty state that doesn't clutter.
2. **Label picker**: search, existing labels with colors, "Create label 'billing'", keyboard selection, many labels (30).
3. **Due date picker**: calendar plus quick picks (Today, Tomorrow, Next week, Clear), keyboard use.
4. **Blocked by and subtasks**: the add flow (search tasks in the project by key or title), the loop refusal, a removed blocker, create a new subtask from the panel.
5. **Quick create** with labels and a due date set.
6. **Task list**: rows with label chips, due states, Blocked marker, subtask progress and parent reference; the label and due filters in the filter bar, including the "3 labels" summary state; sort by due date. Long titles with every marker.
7. **Board**: cards with labels, due date, Blocked and subtask progress; a card with everything at once.
8. **My tasks** with due dates and Blocked markers across projects.
9. **Dashboard Deadlines group** with task due rows mixed with milestone and cycle rows, in the Mine scope.
10. **Project settings, Labels section**: empty, 12 labels, rename, recolor, delete confirm, mirrored project with read-only labels.
11. **Mirrored task panel** with read-only native fields and the reduced Backlog.md block, including BACK-12.1-style subtasks.
12. **Loading and error** states for the panel fields and the Labels section.

Show every screen in light and dark.

## Hand-off

Return:

1. Every screen above in light and dark, as PNGs named `<n>-<section>-<component>-<theme>-<state>.png`.
2. Token additions as CSS custom properties in OKLCH in a new `ledger-m5.css`, with a note for each, including the label palette in both themes with its contrast checks. Leave the earlier sheets unchanged.
3. A component inventory for the new pieces (label chip, label picker, color swatch picker, due date chip and picker, Blocked marker, blocker list row, subtask list row, subtask progress marker, parent reference, filter bar additions, Labels settings row), each with default, hover, keyboard focus, selected, read-only (mirrored) and loading states.
4. The full keyboard shortcut list this release adds.
5. Notes on anything you changed or questioned in this brief, and open questions for the product owner.

Export as HTML (`.dc.html` sources, one per section, plus a canvas file) so a developer can open it locally.
