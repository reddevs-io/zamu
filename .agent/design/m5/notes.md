# M5 design notes

What changed from `brief.md` during the design pass, calls made along the way, and questions still open for the product owner. Read with `tokens.css`, `components.md`, `shortcuts.md` and the screens in `round2/screens/`.

## Changes to the brief

1. **Direction.** Round 1 drew three directions. The product owner picked 1c Margin: Onest for UI, Newsreader for titles, warm paper neutrals and an ink-blue accent. Round 2 draws every screen in it.
2. **Label palette contrast.** Light amber and olive failed 3:1, and white letters on project tiles failed 4.5:1. All four tokens were fixed after the pass (`label-palette.md`). The screens and source already use the fixed values.
3. **Cycle 12 dates.** Changed to Oct 27 – Nov 9 (day 8 of 14), so the screens show a cycle in progress. The brief used Oct 20 – Nov 2 and round 1 used Nov 3 – 16.
4. **Shortcuts added.** G then M (Milestones), G then Y (Cycles), ? (shortcut list), Shift+↑/↓ (extend selection), ⌘A, ⌘C (copy key), ⌘⇧C (copy link), and E / D in the task view (edit title / description). G then P now opens the palette filtered to projects. See `shortcuts.md`, "Conflicts found".

## Calls made in the design (change them if they're wrong)

1. **Bulk changes are for native projects only.** Mirrored tasks are read-only, so the list's action bar and the palette's "Change all 3" only appear in native projects. On a mirrored project, selecting tasks offers Copy keys, Copy links and Open in Backlog.md. The screens draw the action bar (014) and the palette (092) on Harbor, which is mirrored, only because Harbor is the sample list. Build them for native projects.
2. **Mirrored label colours stay editable.** Names come from the files and are locked; colours belong to the app and are never written back (frame 120).
3. **Milestones in mirrored projects come from the files.** No "New milestone" button, and the list says to edit them in the files (107). Cycles are app-side even in mirrored projects, so "New cycle" stays (109).
4. **The peek has no scrim** and doesn't block the board or list behind it. In mirrored projects its properties are read-only and its footer says so (067, 068).
5. **The Home count** in the sidebar is Needs review + Mentions + Blocked + Overdue (8 in the sample). Assigned tasks aren't counted.
6. **Home, Everyone tab** groups by Needs review, Blocked, Overdue and Due this week. Mentions are personal, so they appear only under Mine.
7. **Home, Agents tab** shows one card per agent (working or idle, current task, counts, recent actions) and a "Waiting on a person" list of agent questions and review requests (101).
8. **The blocker picker** only searches the current project and states that in its footer. The loop refusal reads "Can't add: PAY-150 already waits on PAY-142." (075).
9. **The subtask picker** says that new subtasks take the parent's assignee, matching the M5 decision (076).
10. **The task view's J / K** walk the list the person came from, with the position shown ("12 of 40 in List").
11. **When scrolled, the task view's header** shows the title next to the key, and the big title scrolls away (057).
12. **Display options** are saved per person and per view ("Saved for you on this board", 045). Named saved views remain PM-15.

## Answered by the product owner (2026-11-04)

1. **Single sign-on on the sign-in page: keep it.** The app has had OpenID Connect sign-in since 0.1.0 (M1.1), so the button in frame 128 is real. Show it only when OIDC is configured, labelled with the provider's name where it is known. When local sign-in is disabled, the card shows only the SSO button.
2. **Project web address: drop it.** Projects are addressed by key. Remove the "Web address" field and its taken-slug error from the General page (127).
3. **Project archive: not in M5.** Remove the Archive section from the General page (127). The danger zone keeps Delete project only.

## Open questions for the product owner

1. **Sign-in lockout copy.** "2 tries left before a 15-minute pause" assumes rate limiting that the server may not have. Keep the copy only if the backend enforces it.
2. **The agent card counts** ("41 changes today") need an activity query per agent. Fine for M5, or show only the current task and the log?
3. **Swimlanes by assignee** (031) cap each cell with "+ N more". Should a cell expand in place, or open the filtered list?

## For the M5 plan

- Replace `apps/web/src/styles/tokens.css` with `tokens.css`, map it through `@theme inline` in `app.css`, and swap Instrument Sans and Martian Mono for Onest and Newsreader through `@fontsource-variable`.
- Remove the ~520 hand-set `text-[Npx]` sizes in favour of the seven `--text-*` steps.
- Frames 127 and 128 show more than M5 builds: skip the Web address field and the Archive section (see above).
- The `.dc.html` files in `round2/source/` are reference markup, not code to copy. They use a design runtime (`support.js`), not React.
