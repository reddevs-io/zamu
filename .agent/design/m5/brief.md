# Claude Design brief: M5 redesign (new direction, plus labels, due dates, dependencies and subtasks)

Run this in a **new** Claude Design project, "project-management · M5 redesign". Don't upload or reuse anything from the earlier "project-management · M1" project. That project holds the old "Ledger" direction, which this pass replaces.

Upload one file first, then paste everything below the line:

- `.agent/design/m5/assets/before-board-dark.png`: the current board of a real project, as it ships today. It shows what to move away from. Don't copy its data.

The pass runs in two rounds. Round 1 explores three directions. The product owner picks one. Round 2 designs every screen in that direction. Stop after round 1 and wait for the pick.

---

Redesign the web app of an open-source project management tool. Its structure, interaction and visual identity all change, and four task fields that are new to the app get designed in at the same time. You don't need access to any code repository. Everything you need is in this brief and the uploaded screenshot.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans. They get tasks assigned, update status, comment, and leave a trail. Every change shows who made it, and for agents, which human they act for ("claude-dev, acting for Ana"). Most writing happens through a CLI used by agents. People use the web app to plan, review and follow the work.

Audience: developers. They work fast, use the keyboard, and want dense views they can read at a glance. The tool should feel calm, quick and quiet.

## What's wrong today

The uploaded screenshot is a real project with 123 open tasks, on a 1440px screen in dark theme. The product owner finds it overwhelming. The causes:

1. **Subtasks take up as much room as their parents.** The In review column is mostly the children of one parent task (FIN-164.2 to .8), each a full card.
2. **Every card shows every property.** Key, priority glyph, title, milestone chip and avatar all appear on each card. Nearly every task has the same assignee, so the same avatar repeats about 120 times. The three-bar priority glyph takes effort to read.
3. **Heavy cards.** Every card is a bordered box with generous padding, and all cards look alike, so nothing stands out. About 12 cards fit in a column.
4. **Four stacked rows of chrome** come before the first card: title bar, tabs, filter row, column headers.
5. **The detail panel explains where the data comes from louder than it shows the task.** Mirrored tasks get a banner, a hatch pattern on every field, a "·file" tag on every label, and a separate read-only block.
6. **Generally:** monospace and small capitals everywhere, low contrast between levels, square boxes inside boxes, and a dark icon rail with no room for project names.

## Direction

- **Structure and interaction like Linear, visual identity of its own.** Linear is the reference the product owner likes: a collapsible sidebar, one main pane, a slim view header, display options shared by list and board, full-page issues with a peek, and a command palette. Borrow that structure and how it works. Don't make it look like a Linear clone: type, colour, shape and details are yours to propose.
- **Quiet by default.** Show less at once. Properties earn their place on a card or row. Use surface, spacing and type weight for hierarchy before borders.
- **Dense, but not cramped.** A list row stays one line at 1280px with every field set. A board column at 1440px should show noticeably more cards than the screenshot.

## Constraints

- Built in React with React Aria Components and Tailwind v4. Tokens become CSS custom properties. Colours in OKLCH.
- Fonts must be open-licensed (SIL OFL or similar) and self-hostable from Fontsource. No monospace outside task keys, code and keyboard hints.
- One accent colour. Status and label colours are separate, muted sets.
- Light and dark themes are equals. Neither is derived from the other as an afterthought.
- Desktop only: 1440, 1280 and 1024px. At 1024 the sidebar collapses to icons. No phone layouts.
- WCAG AA contrast in both themes. Colour is never the only signal: label colours come with the label's name, and overdue and blocked states also have a word or glyph.
- Keyboard first (see Keyboard below). Every action is reachable from the command palette.

## Domain

- **Workspace**: contains projects and members. A member is a human or an agent. Agents get a quiet glyph on their avatar, not a loud badge.
- **Project**: a name plus a short uppercase key, e.g. "Harbor" with key HBR. A project has a task list, a board, milestones, cycles and settings.
- **Task**: key (HBR-42), title, description (Markdown), status, priority, assignee, milestone, cycle, labels, due date, blockers, subtasks, comments and an activity history.
- **Statuses**: Backlog, Todo, In progress, In review, Done, Canceled. Open means not Done and not Canceled.
- **Priorities**: None, Low, Medium, High, Urgent.
- **Milestone**: a named goal with an optional target date and progress (done of total).
- **Cycle**: a numbered time box (Cycle 12, Oct 20 to Nov 2) with progress and a list of its tasks.
- **Mirrored projects**: some projects mirror a git repository's Backlog.md task files. Their fields can't be edited in the app, but comments can be added (comments stay in the app and never go to the file). Mirrored subtask keys look like HBR-164.2.

### The four new fields

**Labels**
- Belong to one project. Typing a name that doesn't exist creates it. Names are unique per project, case-insensitive, up to 40 characters.
- Each label has a muted colour from a fixed palette of 8 to 10 hues that work in both themes. The app picks one for a new label, and people can change it.
- A task can have several labels. Design for 0, 1, 3 and 8.
- Managed in project settings: a list with usage counts, rename, recolour, and delete. Delete asks for confirmation and says how many tasks lose the label ("Used on 12 tasks"). No typing the name.
- Filters can use labels in a project's list and board, and on Home. On Home, labels that share a name across projects merge into one filter entry.

**Due date**
- An optional date with no time.
- States: none; future ("Nov 4"); within 2 days ("Tomorrow"); today; overdue ("3 days overdue"). Overdue applies only to open tasks. A done task with a past date shows the date quietly.

**Blocked by**
- A task can list other tasks of the same project that block it. The reverse shows too ("Blocks HBR-50, HBR-51").
- A task with at least one open blocker shows a Blocked marker. This is display only: status changes are never refused.
- A link that would create a loop is refused with an explanation ("HBR-12 already waits on HBR-40").
- A blocker that was deleted or hidden reads "Removed task".

**Subtasks**
- One level only: a child can't have children. Children are in the same project.
- A new subtask takes the parent's assignee.
- The parent shows progress: done of total, with canceled excluded.
- **On the board, subtasks are hidden by default.** The parent card shows "5 subtasks · 2 done" and expands in place to list them. A display option shows subtasks as their own cards.
- **In the list**, children can show nested under their parent, which is a display option.

**Mirrored projects**
- Native labels, due date, blockers and parent are filled from the files. Filters and markers work the same as in native projects, but every field is read-only.
- **Show where the data comes from quietly.** One small "Backlog.md" badge in the task header, which links to the file. A lock appears on a field only on hover, or when someone tries to edit it. No banners, hatch patterns or per-field tags.
- Fields with no native home (type, reporter, references, documentation, modified files, dates as written in the file, unknown keys) sit in one collapsed "From the file" section at the bottom of the properties sidebar.

## Structure

**Shell**
- A collapsible left sidebar containing, from top to bottom:
  - the workspace switcher
  - Home (with a count of what needs you)
  - one entry per project, which expands to its List, Board, Milestones, Cycles and Settings
  - workspace settings
  - the person's menu (theme, sign out)
- At 1024 the sidebar collapses to icons.

**View header**
- One slim row: the project name and view, the List / Board switch, Filter, Display, search, and a New task button.
- Active filters show as removable chips in the same row, or in a second row only while there are any.
- For mirrored projects, a quiet sync status ("Backlog.md · synced 38 min ago") with Refresh.

**Display options**
- Shared by list and board, and opened from the Display button. They cover:
  - group by (status, priority, assignee, milestone, cycle, label, none)
  - sub-group or swimlanes on the board
  - order by (priority, due date, updated, created, manual)
  - which properties show
  - show subtasks
  - hide done tasks after N days (default 14)
  - show empty groups
- Board columns can be collapsed.
- Display options are remembered per person, per project and per view.

**Default card and row content**
- **Shown:**
  - title first
  - the key, small and muted
  - a priority icon, only for Urgent and High
  - labels
  - subtask progress
  - due date, when set
  - Blocked marker
- **Hidden by default:**
  - the assignee avatar when the task is the viewer's own; other assignees show
  - the milestone chip, which is available as a grouping
- **Cards have no box.** A light surface with a hover state, not a bordered card.

**Task view**
- Click or Enter opens the task as a full view: content on the left (title, description, subtasks, blockers, comments and activity) and a properties sidebar on the right.
- J/K or arrows in the header go to the previous or next task of the view it was opened from. Esc goes back.
- Space on a selected row or card opens a **peek**: a temporary overlay with the essentials, which closes on Space or Esc.
- There's no permanent detail pane on the list.

**Home**
- Replaces the dashboard and My tasks. It uses the same list component as a project.
- Tasks are grouped by why they're there, in this order:
  1. Needs your review
  2. Mentions you
  3. Blocked
  4. Overdue
  5. Assigned to you
- **Each task appears once**, in the first group it qualifies for. Its other states show as small pills ("blocked", "due in 2 d").
- "Assigned to you" sorts by due date (overdue first, no date last), then priority.
- Header tabs: Mine (default), Everyone, Agents. Agents shows what the workspace's agents are working on now and what they last changed.
- Milestones and cycles ending within 2 days show as rows in a small "Deadlines" strip above the groups.

**Command palette (⌘K)**
- Searches tasks by key or title, projects, and pages.
- Runs actions on the selected task or tasks (status, priority, assignee, labels, due date, milestone, cycle, add blocker, add subtask), plus create task, create project and switch theme.
- Shows each action's shortcut next to it.

## Keyboard

Linear-style single keys. Key hints appear in tooltips and in the palette, never as permanent clutter.

| Area | Key | Action |
|---|---|---|
| Global | ⌘K | Command palette |
| Global | C | New task |
| Global | / | Search the current view |
| Global | G then H | Go to Home |
| Global | G then P | Go to Projects |
| Global | G then L | Go to the current project's List |
| Global | G then B | Go to the current project's Board |
| Global | [ | Toggle the sidebar |
| Lists and boards | J/K or arrows | Move between rows or cards |
| Lists and boards | Left/Right on the board | Move between columns (H/L aren't used, because L is labels) |
| Lists and boards | X | Select |
| Lists and boards | Shift+click | Select a range |
| Lists and boards | Space | Peek |
| Lists and boards | Enter | Open |
| Lists and boards | Esc | Back |
| Lists and boards | V | Switch list and board |
| Lists and boards | Left/Right on a list group row | Collapse or expand it |
| A selected or open task | S | Status |
| A selected or open task | P | Priority |
| A selected or open task | A | Assignee |
| A selected or open task | I | Assign to me |
| A selected or open task | L | Labels |
| A selected or open task | Shift+D | Due date |
| A selected or open task | Shift+M | Milestone |
| A selected or open task | Shift+C | Cycle |
| A selected or open task | Shift+B | Add blocker |
| A selected or open task | Shift+S | Add subtask |
| A selected or open task | M | Comment |
| Dialogs | ⌘↵ | Submit |

Flag any conflicts you find and propose fixes.

## Sample data

Use this made-up data everywhere. Don't use the data in the screenshot.

**Workspace "Northwind Labs"**
- Humans: Ana Ruiz (the viewer), Tomás Ferrer.
- Agents: claude-dev (acts for Ana), review-bot (acts for Tomás).

**Project "Harbor" (key HBR)**
- A mirrored project with 123 open tasks: Backlog 0, Todo 78, In progress 13, In review 32. Also Done 235 and Canceled 6.
- About 85% of the tasks are assigned to Ana or to claude-dev.
- Parent **HBR-164 "Savings goals"** has 7 subtasks (HBR-164.2 to HBR-164.8). Five of them are In review.
- Titles are realistic software work, short to long, e.g.:
  - "Add analytics to the mobile app"
  - "Offline cache: browse every tab without a connection"
  - "Long French and Spanish labels clip on the home screen, the wallet and the search page"
- Labels: frontend, backend, mobile, security, infra, i18n, needs-owner, plus a few more for the 8-label case.
- 2 milestones (Mobile app release, target Nov 14, 60%; Trends verification, no date, 25%). Cycle 12 is current.

**Project "Payments" (key PAY)**
- A native project with 40 open tasks, used for native-field states.
- PAY-142 has everything set: 4 labels, 3 days overdue, blocked by 2 open tasks and 1 done task, blocks PAY-150, and 5 subtasks (3 done, 1 canceled).

**Workspace total:** 6 projects.

## Round 1: three directions

Three directions that share the structure above and differ in visual identity: type, colour, surface, shape and density. Give each a name and one sentence on its idea.

For each direction, in light and dark, at 1440px:

1. **Board** of Harbor with default display options. Done and Canceled are collapsed, and HBR-164 shows its subtask count. Include one card hovered and one selected.
2. **Board with display options open**, showing every option.
3. **List** of Harbor, grouped by status, with HBR-164's subtasks nested.
4. **Task view** of PAY-142 with every field set.
5. **The same Harbor board at 1024px**, with the sidebar collapsed.

Also show a small token sheet per direction: type scale, spacing scale, neutrals, accent, status colours, label palette, radius and elevation.

Stop here for the pick.

## Round 2: every screen in the chosen direction

Show each screen in light and dark. Show the empty, loading and error states where the screen has them, plus long content.

1. **Kit**: every component in default, hover, keyboard focus, selected, disabled, read-only (mirrored) and loading states. Covers:
   - buttons, inputs, menus, pickers, chips, the label chip, the due chip, the Blocked marker and subtask progress
   - avatars, including the agent glyph
   - tooltips with key hints, toasts and dialogs
2. **Shell and sidebar**: expanded, collapsed (1024), a project expanded, the workspace switcher open, and the person's menu open.
3. **Project list**:
   - grouped by status
   - grouped by label
   - subtasks nested
   - filters active as chips
   - a selected row
   - multi-select with an action bar
   - long titles with every marker
   - an empty project
   - a filter with no results
4. **Board**:
   - default
   - swimlanes by assignee
   - subtasks expanded in place
   - subtasks shown as cards
   - a column collapsed
   - drag in progress
   - an empty column
   - a card with everything set
5. **Display options and Filter** popovers. Filters by status, priority, assignee, label, due, milestone, cycle and blocked, including the "3 labels" summary.
6. **Task view**:
   - native, with every field set
   - native, with nothing set (inviting, uncluttered empty fields)
   - mirrored, with the Backlog.md badge, a lock on hover, and the collapsed "From the file" section
   - a long description
   - 40 comments and activity items mixed
   - an agent comment ("claude-dev, acting for Ana")
   - the comment composer
7. **Peek** over the board and over the list.
8. **Pickers**:
   - label: search, create "billing", 30 labels
   - due date: calendar plus Today, Tomorrow, Next week, Clear
   - blocker search, with the loop refusal and a removed blocker
   - subtask: add existing, create new
   - assignee
   - status and priority
9. **Command palette**: empty (recent items and suggested actions), searching tasks, an action submenu (Set status), and acting on 3 selected tasks.
10. **Quick create** with labels and a due date set. Opened with C, it stays a small dialog.
11. **Home**: Mine with every group and the Deadlines strip, Everyone, Agents, a task with pills for several states, and the all-clear empty state.
12. **Milestones**: list with progress and a milestone page. **Cycles**: list and a cycle page.
13. **Project settings, Labels section**: empty, 12 labels, rename, recolour, delete confirm, and a mirrored project with read-only labels marked "From Backlog.md".
14. **One settings page and the sign-in page**, restyled with the kit and no new layout. They show how forms look, so the remaining settings, setup and invite screens can follow without frames.

## Hand-off

Return:

1. **Round 1**: PNGs named `r1-<direction>-<screen>-<theme>[-1024].png` and a token sheet per direction.
2. **Round 2**: PNGs named `<n>-<section>-<component>-<theme>-<state>[-1024].png`, numbered in canvas order.
3. **Tokens** as CSS custom properties in one `tokens.css`, in OKLCH, with light and dark values and a note on each group. The type and spacing scales are named steps (for example `--text-sm`, `--space-3`), not one-off pixel values, so that hand-set sizes can be removed from the code.
4. **The label palette** in both themes, with its contrast checks.
5. **A component inventory** listing every component and its states.
6. **The full shortcut list** as designed, with any conflicts resolved.
7. **Notes** on anything you changed or questioned in this brief, and open questions for the product owner.

Export as HTML (`.dc.html` sources, one per section, plus a canvas file) so a developer can open it locally.
