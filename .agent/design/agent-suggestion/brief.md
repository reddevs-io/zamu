# Claude Design brief: suggest creating an agent from Backlog.md assignees

Run this in the existing Claude Design project "project-management · M1", next to the M3 Screens canvas, so it reuses `ledger.css`, `ledger-m2.css`, `ledger-m3.css` and the M3 setup frames. To run it in a fresh project instead, upload these first and paste everything below the line:

- `.agent/design/m3/source/ledger.css`, `ledger-m2.css` and `ledger-m3.css`
- `.agent/design/m3/screens/39-3i-M3Setup-light-maps.png` and `40-3j-M3Setup-dark-maps.png` (the Mappings step)
- `.agent/design/m1/final/screens/` frames for Settings → Members and the Add agent dialog

---

Design one small addition to an existing screen of a web app. You don't need access to any code repository. Everything you need is in this brief and the uploaded files.

## Product

An open-source, self-hosted project management tool for solo developers and small teams. AI coding agents are workspace members next to humans: each agent has a name (lowercase, numbers and dashes, like `claude-dev`), a responsible human it acts for, and its own API key. Activity reads "claude-dev for Ana Ruiz".

A project can mirror a git repository's Backlog.md task files. Setup is a five-step page: Mode, Source, Mappings, Preview, Read. On the Mappings step, three tables match the values found in the files to values in the app: statuses, priorities and assignees. Assignee values look like `@claude` or `@ana`. Each row shows the value, an arrow, a select with the member it maps to, and the number of tasks carrying it.

Assignees are prefilled by name: `@ana` matches a member named Ana or with the email `ana@…`. When nothing matches, the select shows "No one" with an amber warning border, and those tasks come in unassigned.

The same tables appear on "Edit Backlog.md mappings" for a project that already mirrors.

## The problem

Backlog.md files are often written by coding agents, so assignees like `@claude`, `@codex` or `@copilot` are common. When the workspace has no agent by that name, the row falls back to "No one" and the admin has to leave setup, open Settings → Members, add the agent, and come back.

## What to design

Suggest creating the agent right from the Mappings step.

Agreed behaviour:

1. **Which rows.** An unmatched value that looks like a known coding agent (claude, codex, copilot, cursor, gemini, aider, devin, opencode, amp, and variants like `claude-code`) gets a visible suggestion. Every unmatched row, agent-looking or not, also gets a "Create agent…" option at the top of its select menu.
2. **Accepting.** The existing Add agent dialog opens prefilled: name from the value (`@claude` → `claude`), the signed-in admin as responsible human, key access limited to this project, read and write. On Create, the one-time key reveal dialog shows the new key, then the row maps to the new agent.
3. **Both screens.** Setup and Edit mappings share the editor, so the suggestion appears on both.

The open question for this pass is **where the visible suggestion sits**. Explore at least these placements, each as a full 1280×800 frame of the Mappings step:

- a) A note under the Assignees table, one line per suggested name, with a "Create agent claude" button.
- b) Inside the row itself, under the value.
- c) In the row's select: the select shows the suggestion as its value until the user acts.
- d) A callout at the top of the step, above the Status table.

Then draw the flow with one placement (the designer's pick): the select menu open on an unmatched non-agent row, the prefilled Add agent dialog over the step, the key reveal, the row after creation, and two suggestions at once.

## Sample data

Project Payments (key PAY), workspace members: Ana Ruiz (admin, signed in), Tomás Berg (person), codex-ci (agent, acts for Tomás). Assignee values in the files: `@claude` on 219 tasks (no match, looks like an agent), `@ana` on 64 (matches Ana Ruiz), `@codex-ci` on 31 (matches codex-ci), `@francis` on 5 (no match, not an agent name). The two-suggestion frame adds `@copilot` on 12.

## Constraints

- Keep the Ledger direction: its tokens, square shapes, mapping tables, buttons, popovers and dialogs. Add tokens only if needed and list them.
- People avatars are round; agent glyphs are outlined squares. Something that doesn't exist yet should read as "not created" without colour alone.
- Light and dark themes. Contrast WCAG AA. Desktop, 1280px.
- Keyboard: ⌘↵ continues to Preview, Esc cancels. The suggestion must be reachable by Tab.
- Plain, short copy. No exclamation marks.

## Hand-off

A canvas with the four placements side by side and the flow frames, light and dark, plus a short list of calls made and open questions. Export the sources and a PNG of every frame into `.agent/design/agent-suggestion/`.
