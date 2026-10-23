# Claude Design brief: M3 screens (Backlog.md mirror and import)

Run this in the existing Claude Design project "project-management · M1", next to the M1, M2 and M2.1 canvases, so it reuses `ledger.css`, `ledger-m2.css` and the components already there. To run it in a fresh project instead, upload these files first and paste everything below the line:

- `.agent/design/m1/final/source/ledger.css`
- `.agent/design/m2/source/ledger-m2.css`
- the PNGs in `.agent/design/m1/final/screens/` (app shell, projects, task list, task panel, settings pages)
- the PNGs in `.agent/design/m2/screens/` (board, task panel with activity and comments)
- the M2.1 PNGs for the projects table and the project dialogs with the repository field

---

Design the third set of screens for a web app whose first screens already exist. You don't need access to any code repository; everything you need is here and in the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans: they get tasks assigned, update status, comment, and leave a trail. They work through a command-line tool called `pm`.

Audience: developers. They work fast, use the keyboard, and want dense, readable views over decoration. Calm and neutral, not playful. One accent color.

## What this release adds

Many developers already track tasks with **Backlog.md**, an open-source tool that stores each task as a Markdown file in a `backlog/` folder of the git repository. Agents edit those files directly. This release lets a project read those files from the repository and show them as tasks, in two modes:

- **Mirror.** The project keeps following the repository. Whenever the default branch changes, the project's tasks update. Fields that come from the files are read-only in the app; you change them by editing the file (usually an agent does). Comments, cycle and the order of cards within a board column stay editable in the app.
- **Import.** The same read happens once, then the project detaches and becomes a normal, fully editable project. A mirrored project can also be detached later. Detaching can't be undone.

Reading the repository needs a **git connection**: a provider (GitHub, GitLab, or Gitea/Forgejo), a host (github.com, gitlab.com, or a self-hosted address) and an access token with read access. Connections belong to the workspace and many projects can use one. The project's repository URL is already a project field (M2.1).

## Starting point

Keep the Ledger direction (three permanent panes: sidebar, list, task panel), its tokens and components, and everything M2 added (board, milestones, cycles, comments, My tasks). Add tokens only where the new screens need them, and list every addition.

Reuse the existing settings pages (Members, API keys), dialogs, property controls, task rows and cards, activity history, and the empty, loading and error patterns.

## Constraints

- Built in React with React Aria. No component kit is imposed.
- Light and dark themes, both first-class.
- Desktop first; must work at 1280px and stay usable at 1024px. No mobile layouts.
- Keyboard first. List every shortcut you add.
- Accessible contrast (WCAG AA) in both themes. A locked field must say why it is locked in text, not only with an icon or color.
- Only workspace owners and admins can manage connections, set up a mirror or import, refresh, or detach. Show what a regular member sees on the same screens.

## Domain

Existing (unchanged):

- Workspace, members (humans and agents; agents have a responsible human), projects with a short uppercase key (PAY), tasks with keys like PAY-42.
- Task: title, Markdown description, status (Backlog, Todo, In progress, In review, Done, Canceled), priority (None, Low, Medium, High, Urgent), one optional assignee, optional milestone, optional cycle, comments, activity history.
- Project: name, key, description, optional repository URL, milestones and cycles switched on or off.

New:

- **Git connection.** Lives in workspace settings. It has a name, provider, host, token, status (Working, Token rejected, Host unreachable), last checked time, and the list of projects that use it. The token is never shown again after saving.
- **Backlog.md source.** One per project. It has a connection, the project's repository, a folder (detected, e.g. `backlog/`, and can be overridden), a mode (Mirror or Imported), mappings, last refresh, refresh state, warnings and errors.
- **Mappings.** Backlog.md statuses, priorities and assignees are free text in the files. Setup shows a table per kind that maps each value found in the files to ours, prefilled by name ("To Do" → Todo, "In Progress" → In progress, "Done" → Done; high/medium/low → High/Medium/Low; "@claude" → the claude-dev agent). Unmapped statuses fall back to Todo and unmapped priorities to None, each with a warning. Mappings can be edited later; the next refresh applies them.
- **Task keys.** Backlog.md numbers are kept, so file `BACK-786` becomes task PAY-786 (or BACK-786 if the project key is BACK). Subtasks keep a suffix: PAY-786.1. The original Backlog.md ID is shown on the task.
- **Backlog.md fields we don't have.** Labels, extra assignees, dependencies, parent task and subtasks, due date, type, references and unknown fields show read-only in a "Backlog.md" section of the task panel. Dependencies, parent and subtasks are links to the matching tasks.
- **Drafts and archive.** Backlog.md drafts come in with status Backlog. Archived tasks come in with their own status, usually Done.
- **Milestones.** Backlog.md milestone files become the project's milestones, read-only while mirroring.
- **Removed tasks.** When a task's file disappears from the default branch, the task is hidden from views but kept with its comments, and comes back if the file returns.
- **Refresh.** A refresh runs when the repository sends a push webhook (the user adds it by hand in the provider's settings), when someone presses Refresh now or runs `pm backlog refresh`, and hourly as a fallback. A file that can't be read is skipped and listed; the rest still update. If the Backlog.md config can't be read, the refresh fails and the project keeps its last good state.
- **History.** The first read writes one project-level entry ("Imported 412 tasks and 6 milestones from Backlog.md"). Later changes appear in each task's history as made by "Backlog.md" (a system actor, visually distinct from humans and agents), e.g. "Backlog.md moved PAY-786 from Todo to In progress".

## Screens

1. **Git connections** (new workspace settings page next to Members and API keys): list of connections with provider icon, host, status, last checked and "used by 3 projects". Add/edit dialog: provider, host (prefilled for github.com and gitlab.com, free text for self-hosted), name, token with a note on the read-only scope each provider needs, and a Test result inline (testing, working, rejected, unreachable). Delete confirmation that names the projects whose mirrors will pause. Empty state that explains what connections are for.
2. **Project settings page** (new; today the project only has an edit dialog): General (name, key, description, repository URL, milestones and cycles switches) and a Backlog.md section. Decide whether the existing edit dialog stays as a shortcut or becomes this page, and say why. Show the Backlog.md section in each state: not set up (call to action), mirroring (healthy), refreshing, warnings, last refresh failed, paused (connection broken or deleted), imported (detached, read-only summary of when and from where).
3. **Set up from Backlog.md** (a flow that starts from the empty project state, from the New project dialog as "Start from Backlog.md", and from project settings): pick Mirror or Import, pick a connection (or add one inline), confirm repository and default branch, folder detection result (found, not found, override), the three mapping tables, then a **preview** before anything is written: counts of tasks, drafts, archived tasks, subtasks and milestones; files that will be skipped with the reason; unmapped values with their fallback; the resulting task keys (sample rows). Then progress while the first read runs, and the finished state. Show a repository with no Backlog.md folder, a token without access to the repository, a project that is not empty (setup refused, with the reason), and a project key that does not fit the Backlog.md prefix.
4. **Webhook instructions**: after setup, a panel with the webhook URL and secret (copy buttons), short per-provider steps (GitHub, GitLab, Gitea/Forgejo), and "Last notification received: never / 2 min ago". It must be skippable ("the hourly check covers it").
5. **Mirror status and errors**: last refresh time, the commit it read (short hash, links to the provider), next scheduled check, Refresh now (with a running state), and a list of skipped files with the reason ("BACK-12: dependencies must be a flat list") and warnings ("status 'Blocked' is not mapped; shown as Todo"). Decide whether this lives in project settings, a popover from the header indicator, or both.
6. **Mirrored project in the list and board**: a header indicator ("Mirrored from Backlog.md · owner/repo · refreshed 3 min ago", with warning and failed variants). Create task disabled with the reason. Board: dragging a card to another status column is not allowed (show how that reads with mouse and keyboard), reordering within a column is. Subtask keys with suffix (PAY-786.1) in rows and cards. A marker in the projects table and sidebar for mirrored projects. Hidden "removed from Backlog.md" tasks: how someone finds them (filter or a count).
7. **Mirrored task in the panel and full page**: locked properties (title, status, priority, assignee, milestone, description) that read as locked with the reason and a link to the file in the repository ("Edit backlog/tasks/back-786 - Add webhooks.md"). Cycle and comments stay editable. The Backlog.md section: original ID, labels, extra assignees, dependencies and subtasks as task links (including a dependency that doesn't exist), due date, type, references, unknown fields. A description built from several Backlog.md sections (Description, Acceptance criteria as a checklist, Implementation plan, Implementation notes, Final summary). History entries by the Backlog.md actor. A task removed from Backlog.md, opened by URL. Show what an agent's `pm` command gets when it tries to change a locked field, as a short note (the CLI text is not designed here).
8. **Detach**: the confirmation (irreversible; what changes: everything becomes editable, the mirror stops, the webhook can be removed), and the project right after, including the history entry.

For each screen also show: empty state, loading state, an error state where a request can fail, and a long-content case (long repository paths, 40 statuses in the mapping table, 30 skipped files, a task with 15 labels and 10 dependencies, 1,000+ tasks in the preview).

## Hand-off

Return:

1. Every screen above in light and dark, as frames on a new "M3 Screens" canvas.
2. Token additions and changes, as CSS custom properties in OKLCH in a new `ledger-m3.css` that loads after `ledger-m2.css`, with a note for each new token.
3. A component inventory for the new pieces (connection row, provider icon, test result, setup steps, mapping table, preview summary, skipped-file list, mirror indicator, locked property, Backlog.md section, system actor in history, detach dialog), with their states.
4. The keyboard shortcuts you added.
5. Notes on anything you changed or questioned in this brief, at the top of the canvas.

Export as HTML (one file per screen, or a bundle) so a developer can open it locally.
