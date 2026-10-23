# Backlog.md snapshot fixture

`backlog/` is a copy of the `backlog/` folder of [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md),
the project's own task list, used as a large real-world parser fixture (tasks, subtasks, drafts,
archived and legacy `completed/` tasks, milestones, written across every format era).

- Commit: `6f988de052b8d8ef2eac2828ade7d8690ac7213f` (main, 2026-10-23, release v1.55.3)
- Parser source at that commit is unchanged from `707c8fc` (v1.55.2), the version the M3 plan describes.
- `backlog/assets/` (one image) was left out. Nothing else was changed.
- License: MIT, see `LICENSE` next to this file (copied from the same commit).

This is data only. Nothing in it is executed. To refresh it, copy the `backlog/` folder of a newer
commit over this one, update the commit above, and update the counts in `src/snapshot.test.ts`.
