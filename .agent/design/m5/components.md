# Component inventory (M5, Margin)

Each component lists its states and the screens that show them (frame numbers from `round2/screens/`, light frame first). Class names are the ones in `round2/source/r2/margin.css` and `screens.css`. Each one should become a React Aria component built on `tokens.css`.

## Shell

| Component | States | Frames |
|---|---|---|
| Sidebar (`.side`) | expanded; collapsed to icons (1024px or `[`); project expanded with List, Board, Milestones, Cycles, Settings; Home active | 003, 006, 099 |
| Workspace switcher (`.ws` + menu) | closed, open: workspaces, settings, invite, create | 004 |
| Person menu | open: theme (System / Light / Dark), API keys, shortcuts, sign out | 005 |
| Search entry (`.cmdk`) | default with ⌘K hint; icon only when collapsed | 003, 006 |
| Sidebar item (`.nav-i`, `.sub-i`) | default, active, with count, with the Home count (`.nav-count.hot`) | 003 |
| Project tile (`.tile`) | 6 colours, letter in `--tile-ink` | 003 |
| View header (`.vh`) | crumb (project / page / key), List-Board switch, Filter, Display, Backlog.md sync status, search, New task | 003, 011, 051 |
| Filter bar (`.fbar`, `.fchip`) | chips "field is value" with remove, + Filter, match count, Clear | 013 |

## Controls (kit, frames 001 and 002)

| Component | States |
|---|---|
| Button | primary, secondary (outlined), quiet, danger × default, hover, keyboard focus, disabled; small; icon-only; with key hint |
| Text input | default, keyboard focus, error with message, disabled, read-only (mirrored, with lock); textarea |
| Select button (`.selb`) | default, open |
| Toggle (`.tgl`) | off, on |
| Checkbox (`.box`) | off, on |
| Segmented control (`.seg`) | two options with one on (List / Board, theme) |
| Tabs (`.tab`) | default, active, with count (Home) |
| Key hint (`.kbd`) | single key, chord (⇧D, ⌘↵), on a primary button |
| Tooltip (`.tip`) | label + key hint |
| Toast (`.toast`) | message + Undo + key hint |

## Glyphs and markers

| Component | States | Frames |
|---|---|---|
| Status glyph (`.st`) | Backlog (dashed), Todo, In progress (half), In review (three quarters), Done (filled), Canceled (struck) | 001 |
| Priority glyph (`.pri`) | Urgent (red "!"), High, Medium, Low (bars), None (dash). Cards and rows show only Urgent and High | 001 |
| Label chip (`.lb` + `.lbd`) | default, hover, keyboard focus, mirrored (lock), +N overflow | 001, 030 |
| Due chip (`.due`) | future, soon (Tomorrow, Today), overdue ("3 days overdue"), done (quiet) | 001 |
| Blocked marker (`.blk`) | on cards and rows; the task-view line "Blocked by 2 open tasks" | 030, 051 |
| Subtask progress (`.subp` + `.ring`) | 0/4, 2/7, 3/4, 5/5 | 001 |
| Progress bar (`.bar`), segmented bar (`.seg-bar`) | milestone and cycle progress | 107, 109 |
| Pill (`.pill`) | default, warn, accent, ok | 099 |
| Source badge (`.bm`) | Backlog.md; with sync dot: synced, syncing, sync failed | 001, 054 |
| Avatar (`.av`) | human (round), agent (square), unassigned (dashed); 18, 22 and 28px. The viewer's own avatar is hidden on cards | 001 |

## Board

| Component | States | Frames |
|---|---|---|
| Column (`.col`) | header with status, count, +; empty ("No tasks in Backlog") | 029, 036 |
| Collapsed column (`.colc`) | vertical name + count | 029, 034 |
| Card (`.card`) | default, hover, keyboard focus, selected, multi-selected, mirrored hover (lock), loading, dragged, drop ghost, everything set (urgent, 3 labels + more, subtasks, blocked, overdue, agent) | 001, 029, 030, 035 |
| Parent card | "7 subtasks · 2 done" footer; expanded in place with child rows | 029, 032 |
| Subtask card (`.card.child`) | "↳ HBR-164 Savings goals" reference | 033 |
| Swimlanes (`.lanes`) | lane header with assignee and count; "+ N more" | 031 |
| Drag hint | floating pill "Moving to In review · Esc cancels" | 035 |

## List

| Component | States | Frames |
|---|---|---|
| Group header (`.grp`) | status or label group, count, +, collapse | 011, 012 |
| Row (`.row`) | default, hover, keyboard focus, selected, multi-selected with checkbox, child (tree lines), loading skeleton | 001, 011, 014, 018 |
| Long-title row | title cut to one line, every marker kept on the right | 015 |
| Action bar (`.actbar`) | "3 selected" + Status, Assignee, Labels, Priority, Due, more, Esc | 014 |
| Empty project / no results / error | empty state with actions; "No tasks match" with Clear; error banner with Try again | 016, 017, 019 |

## Popovers and menus

| Component | States | Frames |
|---|---|---|
| Display options | layout, columns, swimlanes, order, subtasks as cards, empty columns, hide done after, card properties, "Saved for you on this board", Reset | 045 |
| Filter menu + submenu | fields list; label submenu with search and checkboxes, "3 selected" | 046, 047 |
| Menu (`.menu`) | search input (empty, typed), section header, item (default, highlighted, checked, dim, create), separator, refusal note (`.menu-note`), info tip, footer with key hints | 071–079 |
| Label picker | on this task (checked), all labels (30, scroll fade), search with highlight, create with colour | 071–073 |
| Due-date picker | type-a-date input, Today / Tomorrow / Next week, calendar (today, selected, keyboard focus, other month), Clear | 074 |
| Blocker picker | result refused by loop note; current blockers with remove; done blocker struck; "Removed task" | 075 |
| Subtask picker | add existing (highlighted match), create new, note on the inherited assignee | 076 |
| Assignee picker | no assignee, people, agents with "for Ana", current checked | 077 |
| Status and priority pickers | number keys, current checked | 078, 079 |
| Colour swatches (`.sw`) | 9 hues, selected ring | 073, 118 |

## Overlays

| Component | States | Frames |
|---|---|---|
| Peek (`.peek`) | over the board, over the list; header with key, source badge, Open, close; properties as chips; latest comment; key hints | 067, 068 |
| Command palette (`.pal`) | empty (recent, suggested); searching with highlight; step with crumb (Set status) and context pill; acting on 3 selected | 089–092 |
| Quick create (`.dlg`) | project crumb, title, description, property buttons set and unset, Create more, Cancel, Create ⌘↵ | 097 |
| Confirm dialog (`.dlg.sm`) | title, message with count, Cancel, danger button | 119 |
| Scrim | light and dark strengths | 097, 119 |

## Task view

| Component | States | Frames |
|---|---|---|
| Header | crumb with key; title appears there once scrolled; ‹ › with "12 of 40 in List"; Copy link; more | 051, 057 |
| Title and description | serif title; Markdown (lists, code, headings, pre); empty "Add a description…" | 051, 053, 056 |
| Subtasks / Blocked by box (`.mbox`) | rows with status, key, title, avatar; hover; done or canceled struck; add line with key hint; empty | 051, 053 |
| Activity | event line, comment, agent comment ("acting for Ana", side rule), "23 earlier · Show all", All / Comments | 057 |
| Composer | closed with M hint; open with Write / Preview, mention menu, Cancel, Comment ⌘↵; mirrored note | 054, 058 |
| Property row (`.prop`) | set, placeholder ("Set priority"), hover with key hint, hover locked with tooltip (mirrored), keyboard focus | 051, 053, 054 |
| From the file | collapsed with field count; open with raw keys and values | 054, 055 |

## Home

| Component | States | Frames |
|---|---|---|
| Deadlines strip (`.dl-i`) | milestone, cycle, overdue task | 099 |
| Home row | project tile and name, key, status, title, pills, due, why ("claude-dev · 40 min ago"), avatar | 099 |
| Group | Needs your review, Mentions, Blocked, Overdue, Assigned to you (by due date, then priority) | 099 |
| Agent card | status pill (Working, Idle), current task with live dot, counts, recent log | 101 |
| All clear | check, message, actions | 102 |

## Planning

| Component | States | Frames |
|---|---|---|
| Milestone row (`.ms-row`) | selected, progress, target, task count, status pill (On track, 2 blocked) | 107 |
| Completed group | collapsed | 107 |
| Current cycle card (`.cyc-cur`) | dates, day N of 14, segmented progress, legend, scope note, stats | 109 |
| Cycle row | upcoming, completed with carry-over note | 109 |
| Page header (milestone, cycle) | kind, source badge, title, description, stats, segmented bar, legend | 108, 110 |

## Settings and forms

| Component | States | Frames |
|---|---|---|
| Settings nav (`.set-nav`) | section header, active item | 116 |
| Label table (`.lbl-tbl`) | empty; row default, hover with actions, renaming, recolour popover, locked ("From Backlog.md") | 115–120 |
| Read-only note (`.ro-note`) | lock + explanation | 120 |
| Form field | label, input, help, error; two-column row; danger zone | 127 |
| Sign-in card | logo, title, fields with focus and error, primary, divider, SSO, footer | 128 |
