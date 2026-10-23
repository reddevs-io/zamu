# Claude Design brief: M2.1 repository link

Run this in the existing Claude Design project "project-management · M1", next to the M1 and M2 canvases, so it reuses `ledger.css` and `ledger-m2.css`. To run it in a fresh project instead, upload `.agent/design/m1/final/source/ledger.css`, `.agent/design/m2/source/ledger-m2.css` and the PNGs in `.agent/design/m1/final/screens/` (the projects screens and the New project dialog) first, and paste everything below the line.

---

Design a small addition to a web app whose screens already exist. You don't need access to any code repository; everything you need is here and in the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams who run several software projects. AI coding agents are members of the workspace, next to humans, and work through a command-line tool called `pm`. Audience: developers. Dense, calm, keyboard first, one accent color.

## What changes

A project can now be linked to one git repository. `pm` uses the link to find the project when it runs inside a clone of that repository, so people and agents no longer pass `--project PAY` on every command.

- One repository per project, unique in the workspace. A second project with the same repository is refused, and the error names the project that has it.
- The URL can be HTTPS (`https://gitlab.com/reddevs/payments.git`), SSH (`git@gitlab.com:reddevs/payments.git`) or `ssh://`. Two URLs are the same repository when host and path match, ignoring case, protocol, user, port and a trailing `.git`. The app shows the short form `gitlab.com/reddevs/payments`.
- The field is optional. Clearing it unlinks the project.
- From a terminal, `pm link --project PAY` sets the same field from the clone's remote. The dialogs can mention this.

## Screens

1. **Projects table**: show the repository on each linked project's row, as a link to `https://<host>/<path>` that opens in a new tab and does not open the project. The Project cell holds the name (13.5px, 600) and the description (12px, muted) on two lines in a 52px row; the table is virtualized with a fixed row height. Show options for where the repository goes, for example on the description line, on a third line, in its own column, or on the name line. For each option show: description and repository, repository without description, description without repository, a long path that truncates, the link on hover. Light and dark.
2. **New project dialog**: add an optional Repository field to the existing dialog (Name, Key, Description). Show empty, filled with an SSH URL and the short form it matches, an invalid URL, and the conflict error after submit.
3. **Edit project dialog**: the existing dialog has Name, Description and a Planning fieldset with two switches (Use milestones, Use cycles). Add Repository. Show a linked project, the field cleared (what saving will do), and the conflict error. Light and dark.

## Constraints

- Keep the Ledger direction, its tokens and components: square corners, 38px inputs, 11.5px hints, danger color for errors, Martian Mono for keys and machine text. Add tokens only if needed and list them.
- Light and dark themes, both first-class. WCAG AA contrast.
- Desktop first: 1280px, usable at 1024px.
- No provider logos (the instance may use GitHub, GitLab, Gitea or Forgejo).

## Hand-off

Return every frame in light and dark, a recommendation among the table options with the reason, any token additions, and notes on anything you changed or questioned in this brief. Export as HTML so a developer can open it locally.
