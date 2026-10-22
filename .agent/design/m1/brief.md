# Claude Design brief: M1 screens

Paste everything below the line into Claude Design. Optional upload: `assets/icon.svg` (placeholder app icon: amber #d97706 rounded square with "PM"). Upload it only if you want the design to keep that amber as the accent.

---

Design the first screens of a web app. You don't need access to any code repository; everything you need is here.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans: they get tasks assigned, update status and leave a trail. Every change shows who made it, and for agents, which human they act for ("claude-dev, acting for Ana").

Audience: developers. They work fast, use the keyboard, and want dense, readable lists over decoration. Calm and neutral, not playful. One accent color.

## Constraints

- Built in React. No component kit is imposed: design the components the screens need and list them.
- Light and dark themes, both first-class.
- Desktop first; must work at 1280px and stay usable at 1024px. Mobile layouts are not needed yet.
- Keyboard: show shortcut hints where they belong (C to create a task, / to search, J/K to move in lists, Esc to close panels).
- Accessible contrast (WCAG AA) in both themes.

## Domain

- Workspace: contains projects and members. A user can belong to several workspaces.
- Member: a human or an agent. Agents need a distinct but quiet visual marker (for example a small bot glyph on the avatar), never a loud badge.
- Project: name plus a short uppercase key, e.g. "Payments" with key PAY.
- Task: key (PAY-42), title, description (Markdown), status, priority, assignee (human or agent, optional), creator, created and updated times.
- Statuses: Backlog, Todo, In progress, In review, Done, Canceled.
- Priorities: None, Low, Medium, High, Urgent.
- Activity: each change to a task is recorded ("claude-dev, acting for Ana, moved PAY-42 from Todo to In progress, 3 min ago").
- API key: secret token used by the command-line tool. Agents get one or more keys, scoped to the whole workspace or to chosen projects, read-only or read-write. A key is shown once at creation.

## Screens

1. **Sign in**: email and password. Leave room for a "Continue with SSO" button that appears when the server has single sign-on configured (show both variants).
2. **First run**: the first person to open a fresh install creates their admin account and names the first workspace. One short flow, two steps at most.
3. **App shell**: left sidebar with a workspace switcher, the project list, and placeholder slots for "Dashboard" and "My tasks" (built later, show them as normal nav items). Top bar with search and a user menu. Collapsible sidebar.
4. **Projects**: list of projects in the workspace with task counts by status, plus a "New project" dialog (name, key auto-suggested from the name and editable).
5. **Project task list**: the main screen. Rows show key, title, status, priority, assignee and updated time. Grouped by status with collapsible groups. Filter by status, priority and assignee (including "assigned to agents"). Must stay readable with 200+ tasks. Include the empty project state.
6. **Task detail**: opens as a side panel over the list (and as a full page via direct link; show both). Editable title and description, property controls for status, priority and assignee, then the activity history. Reserve a comment box at the bottom of the history; comments come in a later release, so show where it goes.
7. **Quick create task**: keyboard-first dialog: title, then optional status, priority, assignee. "Create more" toggle to keep the dialog open.
8. **Members settings**: one list of humans and agents with role and, for agents, the human responsible. "Invite person" and "Add agent" actions. Add agent asks for a name, the responsible human, and key scope.
9. **API keys**: per agent (and for the signed-in human's own CLI use): list with name, scope, created, last used, and revoke. Creation ends on a reveal-once screen with copy button and a one-line CLI example (`pm login --key <key>`).

For each screen also show: empty state, loading state, an error state where a request can fail, and a long-content case (long titles, long names).

## Hand-off

Return:

1. Every screen above in light and dark.
2. The design tokens as CSS custom properties in OKLCH (background, foreground, muted, accent, destructive, border, focus ring, status colors, sidebar colors), plus radius, spacing, font families and the type scale.
3. A short component inventory: the components each screen uses, with their states.
4. Notes on anything you changed or questioned in this brief.

Export as HTML (one file per screen, or a bundle) so a developer can open it locally.
