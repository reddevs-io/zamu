# Claude Design brief: M4 screens (cross-project dashboard)

Run this in the existing Claude Design project "project-management · M1", next to the M1 and M2 Screens canvases, so it reuses `ledger.css`, `ledger-m2.css` and the existing components. To run it in a fresh project instead, upload these first and paste everything below the line:

- `.agent/design/m2/source/ledger.css` and `.agent/design/m2/source/ledger-m2.css`
- The PNGs in `.agent/design/m1/final/screens/` and `.agent/design/m2/screens/` (at least the app shell, My tasks, milestones, cycles and comments screens)

---

Design one new screen, the dashboard, for a web app whose other screens already exist. You don't need access to any code repository. Everything you need is in this brief and the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans. They get tasks assigned, update status, comment, and leave a trail. Every change shows who made it, and for agents, which human they act for ("claude-dev, acting for Ana").

Audience: developers. They work fast, use the keyboard, and want dense, readable views over decoration. The look is calm and neutral, not playful, with one accent color.

## Starting point

The app follows the "Ledger" direction: a left rail, a main pane, and a task side panel that opens on the right. Tokens and component styles are in `ledger.css` and `ledger-m2.css`. The existing screens cover projects, the task list and board, milestones, cycles, task detail with comments, and My tasks (every task assigned to me across projects, grouped by status).

- Keep the Ledger direction, its tokens and its components. Add tokens only where the dashboard needs them, and list every addition.
- Reuse the existing task row, avatars (with the quiet agent glyph), status and priority icons, progress bar, milestone and cycle chips, the side panel, and the existing empty, loading and error patterns.
- The rail currently shows My tasks, Projects, the project keys, Settings and the user menu. The dashboard becomes the first rail item and the page you land on after signing in.

## Constraints

- Built in React with React Aria. No component kit is imposed.
- Light and dark themes are both first-class.
- Desktop first. It must work at 1280px and stay usable at 1024px with the side panel open. Mobile layouts are not needed.
- Keyboard first. Existing shortcuts: C creates a task, / searches, J/K move between rows, Enter opens, Esc closes, G then M goes to My tasks. New: G then D goes to the dashboard. Propose any other shortcuts the page needs, for example toggling the scope or jumping between groups, and list them all.
- Accessible contrast (WCAG AA) in both themes. Never use color as the only signal for "overdue" or "stalled".
- No charts. Counts, progress bars and short text only.
- The page refreshes in the background every 30 seconds and on window focus. Refreshes must not move the row under the keyboard focus or close the side panel.

## Domain

- Workspace: contains projects and members. The dashboard covers the current workspace only.
- Member: a human or an agent. Each agent has a responsible human.
- Project: name plus a short uppercase key, e.g. "Payments" with key PAY. A project may use milestones, cycles, both or neither.
- Task: key (PAY-42), title, status, priority, assignee (human or agent, optional), created and updated times.
- Statuses: Backlog, Todo, In progress, In review, Done, Canceled. There is no Blocked status and tasks have no due dates.
- Priorities: None, Low, Medium, High, Urgent.
- Milestone: belongs to one project; name, optional target date, status (Planned, Active, Completed), progress as done over total.
- Cycle: a time-boxed sprint in one project, e.g. "Cycle 12 · Checkout rewrite", with start and end dates. At most one current cycle per project.
- Comment: Markdown by a human or an agent, and it can @mention members. Mentions are the only way an agent asks a human for input: it mentions its responsible human.
- Some projects will later be read-only mirrors of a git repository's task files ("Backlog.md mirror"). Their tasks behave like normal tasks on the dashboard. Leave room for a small source marker on a project row; another release designs the marker itself.

### Scope

A toggle at the top of the page switches between:

- **Mine** (default): tasks assigned to me, tasks assigned to agents I'm responsible for, and comments that mention me.
- **Everyone**: the whole workspace.

The toggle filters the action queue and the agents strip. Project rows always show the whole project.

### Action queue

The top of the page, and the part that must stand out. It lists what needs someone to act now, in four groups:

1. **In review**: tasks with status In review. Row: task key and title, project key, assignee (agent glyph and "acting for" where relevant), priority, how long it has been in review.
2. **Mentions**: comments that mention me (under Everyone: anyone) and have no answer yet. A mention is answered when the mentioned person comments later on the task or changes the task. Row: who mentioned (human or agent), a one-line excerpt of the comment, the task key and title, and when.
3. **Stalled**: tasks In progress with no update or comment for 24 hours if an agent holds them, or 5 days if a human does. Row: task, assignee, "no update for 2 days", priority.
4. **Deadlines**: these rows are milestones and cycles, not tasks. They show milestones past their target date that still have open tasks ("PCI audit · 11 days overdue · 4 open"), and current cycles ending within 2 days that still have open tasks ("Cycle 12 ends in 2 days · 7 open"). A row opens the milestone or cycle page.

Each group shows its count and its first 5 items, with "Show all" expanding the group in place up to 50 items. When there are more than 50, show "Showing 50 of 132". Items leave the queue only when their condition clears. There is no dismiss or snooze. A task can appear in two groups (in review and mentioned, say), and that's fine. Groups with nothing in them collapse to a single quiet line or disappear; choose one and say why.

Task rows open the existing task side panel, as on My tasks. The queue stays in place behind it.

### Projects

Below the queue, one compact row per project in the workspace, most recently active first:

- key and name
- counts: open, in progress, in review
- current cycle, if the project uses cycles: name, days left, progress
- active milestone, if the project uses milestones: the one with the nearest target date, with its progress and "+2 more" when there are others
- last activity time

A row opens the project. Projects that use neither milestones nor cycles get a shorter row.

### Agents

Below the projects, a strip or list of agents (under Mine, only my agents). For each agent: name and glyph, responsible human, current task (in progress and assigned to it, "+2" if several), and last activity time. Mark a stalled agent with something other than color. An agent with nothing in progress reads "Idle".

## Screens

1. **Dashboard, Mine scope**: a typical day. Three projects, two agents, items in every queue group, one overdue milestone and one cycle ending tomorrow.
2. **Dashboard, Everyone scope**: the same workspace, more items, rows showing whose action is needed.
3. **Dashboard with the side panel open** on an In review task, at 1280px and at 1024px.
4. **A group expanded** with "Show all", including the "Showing 50 of 132" case.
5. **Rail**: the new Dashboard item first, with the queue count as a badge. Show 0 (no badge or a quiet one; choose), 7, and 99+, in the expanded and collapsed rail.
6. **All clear**: projects exist and nothing needs action. A calm, short message, with the project rows and agents still shown.
7. **New workspace**: no projects yet. Point to creating the first project and inviting an agent.
8. **Loading** (first load and background refresh) and **error** (the dashboard request failed, with a retry).
9. **Long content**: long task titles and project names, 30 projects, 12 agents, a mention excerpt with code in it, an agent with five tasks in progress.

Show every screen in light and dark.

## Hand-off

Return:

1. Every screen above in light and dark.
2. Token additions and changes, as CSS custom properties in OKLCH, in a new `ledger-m4.css`, with a note for each new token. Leave `ledger.css` and `ledger-m2.css` unchanged.
3. A component inventory for the new pieces (scope toggle, queue group header, mention row, stalled row, deadline row, project row, agent card or row, rail badge), with their states: default, hover, keyboard focus, selected (panel open) and loading.
4. The full keyboard shortcut list for the page.
5. Notes on anything you changed or questioned in this brief.

Export as HTML (one file per screen, or a bundle) so a developer can open it locally.
