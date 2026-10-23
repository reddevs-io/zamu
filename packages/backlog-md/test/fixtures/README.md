# Parser fixtures

- `eras/2025-06-plain`: plain `## Heading` sections, `(Optional)` headings and `## Notes`, date-only
  and two-digit-year dates, `@assignee` without quotes, zero-padded IDs, legacy `milestones:` in
  config.yml, legacy `completed/`, an old-style `task-N` draft that current Backlog.md ignores.
- `eras/2025-09-markers`: section markers, legacy per-comment `<!-- COMMENT:BEGIN -->` blocks,
  `YYYY-MM-DD HH:mm` timestamps, a custom task prefix, subtasks and nested subtasks, drafts, archive,
  milestone files, docs/ (ignored).
- `eras/2026-10-iso`: ISO UTC timestamps, delimited comments, a root `backlog.config.yml` naming the
  folder `planning/`, zero-padded milestone IDs.
- `errors`: one file per named parse error, plus files that parse with warnings.
- `snapshot`: Backlog.md's own `backlog/` folder at a pinned commit (see its README).

`biome.json` here keeps Biome from reformatting the fixtures: they must stay byte-for-byte as
Backlog.md writes them.
