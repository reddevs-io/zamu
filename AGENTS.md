# project-management

Self-hosted, MIT-licensed project management tool for agent-driven development. Stack, scope and decisions live in the Memory Bank (`memory-bank/`).

## Planning

- Run a Claude Design pass before writing an implementation plan that adds or reshapes UI: new screens, navigation, layout, or visual direction. Build the plan on the design output.
- Skip the pass for backend, CLI or infrastructure work, and for UI work that only reuses existing screens and components. The plan states why it was skipped.
- The Claude Design prompt is self-contained: product context, screens and their states, constraints (the UI stack recorded in the Memory Bank, light and dark themes), the assets to upload, and the hand-off format expected back. Claude Design cannot read this repo.
- Keep the brief and the exported design under `.agent/design/<milestone>/`. Plans and implementing agents link to it there.

## Backlog

- Out-of-scope work and follow-ups go in Backlog.md (`backlog/`, prefix `PM`), not in Memory Bank issues. Work that lands in gitops goes in its own backlog (prefix `OPS`); label infra work that stays in this repo `infra`.
- Labels in use: `bug`, `feature`, `perf`, `security`, `refactor`, plus an area (`web`, `worker`, `db`, `infra`).

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.55.3 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
