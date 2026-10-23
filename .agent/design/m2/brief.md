# Claude Design brief: M2 screens (work views)

Run this in the existing Claude Design project "project-management · M1", next to the M1 Screens canvas, so it reuses `ledger.css` and the M1 components. To run it in a fresh project instead, upload `.agent/design/m1/final/source/ledger.css` and the PNGs in `.agent/design/m1/final/screens/` first, and paste everything below the line.

---

Design the second set of screens for a web app whose first screens already exist. You don't need access to any code repository; everything you need is here and in the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans: they get tasks assigned, update status, comment, and leave a trail. Every change shows who made it, and for agents, which human they act for ("claude-dev, acting for Ana").

Audience: developers. They work fast, use the keyboard, and want dense, readable views over decoration. Calm and neutral, not playful. One accent color.

## Starting point

The first release shipped in the "Ledger" direction: three permanent panes (sidebar, list, task panel), the tokens and component styles in `ledger.css`, and the screens in the M1 Screens canvas (sign in, first run, app shell, projects, project task list, task detail as panel and page, quick create, members, API keys).

- Keep the Ledger direction, its tokens and its components. Add tokens only where the new screens need them (for example milestone and cycle colors, drop targets, mention chips) and list every addition.
- Reuse the existing task row, property controls, filter bar, side panel, dialogs, avatars (with the quiet agent glyph) and empty, loading and error patterns.
- The sidebar already has "Dashboard" and "My tasks" slots. My tasks becomes real in this release. Dashboard stays a placeholder.

## Constraints

- Built in React with React Aria. No component kit is imposed.
- Light and dark themes, both first-class. This release adds a manual theme choice: Light, Dark or System.
- Desktop first; must work at 1280px and stay usable at 1024px. Mobile layouts are not needed.
- Keyboard first. Show shortcut hints where they belong: C create task, / search, J/K move, Esc close, plus the new ones you propose for the board and comments (for example H/L between columns, Shift+H/L to move a card, M to comment, ⌘/Ctrl+Enter to send). List every shortcut.
- Accessible contrast (WCAG AA) in both themes. Drag and drop always has a keyboard alternative.

## Domain

Existing:

- Workspace: contains projects and members. A user can belong to several workspaces.
- Member: a human or an agent. Agents have a responsible human.
- Project: name plus a short uppercase key, e.g. "Payments" with key PAY.
- Task: key (PAY-42), title, Markdown description, status, priority, assignee (human or agent, optional), creator, created and updated times.
- Statuses: Backlog, Todo, In progress, In review, Done, Canceled.
- Priorities: None, Low, Medium, High, Urgent.
- Activity: each change to a task is recorded ("claude-dev, acting for Ana, moved PAY-42 from Todo to In progress, 3 min ago").

New in this release:

- Milestone: belongs to one project. Name, optional description, optional target date, status (Planned, Active, Completed). Progress is done tasks over all tasks, canceled excluded. A task belongs to at most one milestone.
- Cycle: a time-boxed sprint in one project. Number and optional name ("Cycle 12" or "Cycle 12 · Checkout rewrite"), start and end dates, state (Upcoming, Current, Completed). At most one current cycle per project. A task belongs to at most one cycle. When a cycle ends, its unfinished tasks roll over to the next cycle, and the completed cycle keeps a record of what rolled over.
- Milestones and cycles are both optional per project. A project may use either, both or neither.
- Comment: Markdown, written by a human or an agent (agents comment through the command-line tool). Authors can edit and delete their own comments; edited comments show "edited". Comments can @mention humans and agents. There are no notifications yet, so a mention is only a highlighted link to the member.

## Screens

1. **Project view switcher**: the project header gains a List / Board toggle (remembered per project, shortcut hint) and tabs or links for Milestones and Cycles. Show how the header reads with both, one, or neither of milestones and cycles in use.
2. **Board**: one column per status, in status order, with task cards (key, title, priority, assignee, milestone and cycle chips when set). Same filter bar as the list, plus filters by milestone and cycle. Card states: default, hover, keyboard focus, selected (panel open), dragging, drop target, and a column over 50 cards. Optional swimlanes by assignee or by milestone, with collapsible lanes and a "No assignee" / "No milestone" lane. Clicking or pressing Enter on a card opens the existing task side panel. Show the empty board and a board with Canceled and Done collapsed.
3. **Milestones**: the project's milestones as a list with name, target date (overdue in a quiet warning style), status, a progress bar and done/total counts. "New milestone" dialog (name, description, target date). Milestone page: header with progress and dates, then its tasks grouped by status using the existing task rows. Show the empty state that explains what milestones are for.
4. **Cycles**: the current cycle up top with dates, days left, progress and scope (tasks added after start marked quietly), then upcoming and completed cycles. "New cycle" dialog (start and end dates prefilled from the last cycle's length, optional name). Cycle page: its tasks grouped by status. Completed cycle page: summary with completed, rolled over and canceled counts, and the list of rolled-over tasks with where they went. Show the end-of-cycle moment: a confirmation that lists the unfinished tasks and the cycle they will move to.
5. **Task detail additions**: milestone and cycle property controls in the existing panel and full page, and in quick create.
6. **Comments in the activity history**: comments sit inline with activity entries in time order and must be easy to tell apart from them. Show a human comment, an agent comment ("claude-dev, acting for Ana"), an edited comment, a deleted comment placeholder, a long comment with code blocks and a list, and a comment with @mentions of a human and an agent. Composer at the bottom (the slot M1 reserved): Markdown with a preview toggle, the @mention picker open with humans and agents, sending state, and a failed send that keeps the text. Edit-in-place and delete confirmation.
7. **My tasks**: tasks assigned to the signed-in user across every project in the current workspace, grouped by status, each row showing the project key. Same filters as the project list plus a project filter. Opens tasks in the side panel. Show the empty state ("Nothing assigned to you").
8. **Theme choice**: Light / Dark / System in the user menu, and the same choice on a small Profile or Appearance settings page if that reads better. Show where it lives.

For each screen also show: empty state, loading state, an error state where a request can fail, and a long-content case (long titles, long milestone and cycle names, 200+ tasks on My tasks, a 60-card column).

## Hand-off

Return:

1. Every screen above in light and dark.
2. Token additions and changes to `ledger.css`, as CSS custom properties in OKLCH, with a note for each new token.
3. A component inventory for the new pieces (board column, card, swimlane, milestone row, progress bar, cycle header, comment, composer, mention picker, theme switch), with their states.
4. The full keyboard shortcut list.
5. Notes on anything you changed or questioned in this brief.

Export as HTML (one file per screen, or a bundle) so a developer can open it locally.
