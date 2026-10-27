# M5 design pass: shared spec for the section agents

Brief: `.agent/design/m5/brief.md` (read it). Direction: Ledger (2a). Claude Design project
`6fd73234-e02d-4621-95b6-528007298671` ("project-management · M1"), files at the project root next to the M1-M4 files.

## Files and conventions

- Work locally in `.agent/design/m5/source/` (served at http://localhost:8765/, already running). Every file there is
  also uploaded to the Claude Design project root with the same name.
- Style sheets: `ledger.css`, `ledger-m2.css`, `ledger-m3.css`, `ledger-m5.css` (and `ledger-m4.css` for the dashboard).
  Load them in that order with `<link rel="stylesheet" href="./...">` inside `<helmet>`. **Read ledger-m5.css first**:
  it holds the new tokens and every new component class with markup examples. Use those classes; don't invent
  parallel ones. If you truly need a new shared class, add it to a `<style>` block in your own file and mention it
  in your report (the lead will move it into ledger-m5.css).
- References to copy from (same data and look): `.agent/design/m4/source/M4Dashboard.dc.html` (440px side panel on the
  right, the current app layout), `.agent/design/m3/source/M3Task.dc.html` (mirrored panel, Backlog.md block, lock
  hatch), `.agent/design/m2/source/M2Task.dc.html` (pickers, quick create), `M2Board.dc.html`, `M2MyTasks.dc.html`,
  `.agent/design/m3/source/M3ProjectSettings.dc.html`, `M3Mirror.dc.html`. Copy their rail, header and row markup.
- File format: `.dc.html` as in those files: `<x-dc>` template, `<helmet data-dc-atomics>`, logic class `Component`
  with `renderVals()`, props `theme` (light|dark) and `state` (your list), plus `width` ("1280" default, "1024").
  Root element: `<div class="lg-root lg-{theme}">` sized 1280x800 (or 1024x800) unless your screen needs more height;
  set height inline. Put `data-screen-label` on the root.
- Template holes are lookups only. Compute everything in `renderVals()`. Close every tag explicitly; double-quote
  attributes. No hand-drawn SVG beyond simple shapes. Keep each file under ~1000 lines.
- Viewing one frame: `http://localhost:8765/M5Frame.dc.html?c=<kit|panel|rel|list|my|board|dash|labels>&theme=dark&state=<s>&width=1024`.
  Screenshot: `node /tmp/m5tools/shot.mjs "<url>" /tmp/m5tools/<name>.png 1280 800 0` (prints console errors and
  failed requests; use width 1024 for 1024 frames, and a larger height with last arg `1` for tall frames).
  Then look at the PNG with the Read tool. Fix anything clipped, overlapping, wrapping when it should not, or
  unreadable, in both themes.
- Upload: when your file renders cleanly, upload it to the project with `mcp__claude-design__write_files`
  (project_id above, path = file name, data = the exact file content, plan_token = the token in your prompt,
  if_match "0" for a new file). Load the tool schema first with ToolSearch `select:mcp__claude-design__write_files`.
- Do not touch git, Backlog, or any file you don't own.

## Fixed world (use exactly, so screens agree)

- Today is **Tuesday Oct 27, 2026**. Workspace Reddevs. Signed in: Ana Ruiz (AR, `--h:25`).
- People: Ana Ruiz (AR, 25), Tomás Berg (TB, 220), Clara Lindqvist (CL, 150). Agents (outlined square glyph
  `.lg-ag`): claude-dev (C, acting for Ana Ruiz), codex-ci (X, acting for Tomás Berg).
- Projects in the rail: PAY Payments (native, 38 open), WEB Website (27), CLI Command-line tool (9),
  BACK Backend (mirrored from Backlog.md, 41), INF Infrastructure (5).
- Main task **PAY-142** "Retry failed webhook deliveries with exponential backoff": In progress, High, claude-dev for
  Ana Ruiz, milestone Webhooks v2, Cycle 12 (3d left), created by Ana Ruiz Oct 20.
  - Due **Oct 24** → "3 days overdue" (panel) / "3d overdue" (rows).
  - Labels (4): webhooks (teal), reliability (green), merchant-facing (orange), backend (slate).
    8-label case adds: billing (blue), q4 (amber), security (red), needs-docs (pink).
  - Blocked by (2 open, 1 done): PAY-139 "Stream invoice PDFs instead of buffering them in memory" (In progress,
    codex-ci); PAY-151 "Webhook signature check accepts expired timestamps" (Todo, Tomás Berg); PAY-120 "Drop the
    v1 webhook payload format" (Done, claude-dev) shown struck and quiet, it no longer blocks.
  - Blocks: PAY-150 "Merchant dashboard: failed deliveries".
  - Subtasks 3/5 done (canceled excluded): PAY-143 "Honour Retry-After on 429 responses" Done claude-dev;
    PAY-144 "Add ±20% jitter to each delay" Done claude-dev; PAY-145 "Store attempts in webhook_attempt" Done
    codex-ci; PAY-146 "Dead-letter queue after the sixth attempt" In progress claude-dev; PAY-147 "Alert merchants
    after 24h of failures" Todo, unassigned; PAY-148 "Retry over SMS" Canceled (shown faint, not counted).
- Label palette (9): slate, red, orange, amber, green, teal, blue, violet, pink → `var(--lb-<name>)`.
- PAY labels for settings (12, usage count): backend slate 22, webhooks teal 14, q4 amber 12, billing blue 11,
  reliability green 9, api slate 8, merchant-facing orange 7, refunds violet 6, docs pink 5, sepa amber 4,
  security red 3, tech-debt slate 2.
- Mirrored project BACK (Backend, from `backlog/` on `main`). Task BACK-12 "Move session storage to Redis" with
  subtasks BACK-12.1 "Write the Redis session adapter", BACK-12.2 "Migrate existing sessions on deploy". Its labels
  from the file: sessions, redis, infra (all slate, read-only, "From Backlog.md"). Depends on BACK-9 (Done) and
  BACK-31 (In progress). Due date from the file: Nov 4.

## Visual decisions (already made, follow them)

- **Label chip** `.m5-lb`: 7px square swatch + name, 18px, bordered like `.m2-chip`. Name always shown. Rows show at
  most 2 chips then `.m5-lbmore` "+2"; with the panel open, 1 chip then "+N". Cards: chips on one line, then "+N".
  Panel: every label, wrapping. Mirrored: `.m5-lbro` (hatch).
- **Due date**: future `.m5-due` ("Nov 4", glyph + mono); today/tomorrow/in 2 days `.m5-duesoon` ("Due today",
  "Tomorrow", "Thu" for Oct 29 in rows, "Due in 2 days" in panel); overdue open `.m5-dueover` pill ("3d overdue" rows,
  "3 days overdue" panel); done with past date `.m5-duedone` (quiet). No due date: nothing in rows; "No due date"
  faint in the panel cell.
- **Blocked** `.m5-blk` (glyph + "Blocked") in rows, cards, My tasks; `.m5-blkq` in the panel header next to the key.
- **Subtask progress** `.m5-sub` "3/5" with a 16px bar; `.m5-subdone` when all done.
- **Parent reference** `.m5-par` "↳ PAY-142" after the title (replaces today's "sub of PAY-786" text). In the panel,
  `.m5-parline` above the title: "↳ Subtask of PAY-142 Retry failed webhook…".
- **List row** (1280, no panel): Key 72 | Title 1fr (title, then parent ref, subtask marker, Blocked; title truncates,
  markers never) | Labels 176 | Due 92 | Pri 34 | Assignee 112 | Upd 34. Group headers by status as today.
  With the panel open (list 776px wide): Key | Title (markers kept) | Labels 92 (1 chip + "+N") | Due 76 | Assignee
  avatar 18. One line always.
- **Panel property grid** (440px panel → 2 columns): Status, Priority / Assignee, Due date ⇧D / Milestone ⇧M,
  Cycle ⇧C / Labels # spanning both columns (`.m5-span`). "Created" leaves the grid and becomes a quiet line in the
  panel header: "PAY-142 · created by Ana Ruiz, Oct 20".
- **Panel order**: header (key, Blocked marker, Open as page, Esc) → parent line if any → title → property grid →
  description fold → "Blocked by" section (count "2 open", list `.m5-rl` of `.m5-r` rows, `+ Add blocker ⇧B`) →
  "Blocks" line ("Blocks PAY-150") → "Subtasks" section (`.m5-subbarl` progress + "3 of 5 done", rows,
  `+ Add subtask ⇧S`) → activity and comments → composer.
  Empty: one quiet line instead of both sections: `+ Add blocker ⇧B   + Add subtask ⇧S` (`.m5-emptyrel`).
- **Shortcuts** (new): `#` labels picker, `⇧D` due date, `⇧B` add blocker, `⇧S` add subtask. They work in the panel,
  on the focused row in the list, My tasks and the board, and in quick create. (Bare L and ⇧L are taken by the
  board's h/j/k/l moves.) In pickers: ↑↓ move, ↵ toggle/pick, Esc close; label picker ⌘↵ creates when the name is
  new; date picker T today, ←→↑↓ move by day/week, PgUp/PgDn month, ⌫ clear. In the add-blocker / add-subtask
  search, ⌘↵ on a typed title creates a new task (subtask only).
- **Filter bar** (in `.lg-bar`): existing filters stay as text; new: "Label" and "Due" as `.m5-f`; set filters as
  `.m5-fon` chips ("Label | billing ×", "Label | 3 labels ×", "Due | Overdue ×"); sort control "Sort: Due date ↑"
  `.m5-sort` at the right.
- **Mirrored**: native fields filled from the file, all with the hatch and "· file" owner note like M3; label chips
  `.m5-lbro`; the Backlog.md block keeps only: Type, Reporter, References, Documentation, Modified files, Created and
  Updated as written, Other fields.
- Loading: `.lg-skel` bars and `.m5-lbsk`; errors: `.lg-banner` with Retry, copy in plain words.
- Copy style: short, plain, sentence case, no exclamation marks, no "please".
