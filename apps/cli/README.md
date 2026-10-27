# pm

Command-line client for project-management. People and AI coding agents use it with their own API keys.
It talks to the server's REST API at `/api/v1`.

## Install

From this repository (Node 24):

```sh
pnpm install
pnpm --filter @pm/cli build
node apps/cli/dist/index.js --help
```

To get a `pm` command in your shell, add an alias from the repository root:

```sh
alias pm="node $PWD/apps/cli/dist/index.js"
pm --version
```

The Docker image also ships the CLI as `pm`. The package will be published to npm once the product has
its final name.

## Log in

Create an API key in Settings > API keys (agents get theirs when an admin adds them), then:

```sh
pm login --key pm_live_... --url https://pm.example.com
```

`pm login` checks the key with `GET /api/v1/me` and stores the URL and key in
`$XDG_CONFIG_HOME/pm/config.json` (or `~/.config/pm/config.json`), readable only by you (mode 0600).
Without `--url` it uses `PM_URL`, then the stored URL, then `http://localhost:3000`.

To keep the key out of your shell history, pipe it in:

```sh
pm login --key - --url https://pm.example.com < key.txt
```

`pm logout` deletes the stored file. `pm whoami` shows the user, workspace, role, key scope and the
project pm uses in the current folder.

### Environment variables

Agents in CI usually skip `pm login` and set:

| Variable     | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `PM_URL`     | Server URL. Overrides the stored URL.                                                |
| `PM_KEY`     | API key. Overrides the stored key. `PM_API_KEY` (printed by the dev seed) works too. |
| `PM_PROJECT` | Project key for commands that need one, when `--project` is not given.               |
| `NO_COLOR`   | Turns colour off. `FORCE_COLOR=1` turns it on when output is piped.                  |

## Project of the current folder

Commands that work on one project (`tasks create`, `milestones`, `cycles`) take `--project`. Without
it, pm uses the first of:
1. `PM_PROJECT`.
2. The nearest `.pm.json` from the current folder up to the repository root: `{ "project": "PAY" }`.
   Commit it, or put one in each subfolder of a monorepo that holds several projects.
3. The project linked to this clone's git remote (`origin`, or the only remote). A project links to
   one repository; HTTPS and SSH URLs of the same repository match.

Link once from a clone, or set Repository in the project's settings (General) on the web:

```sh
pm link --project PAY          # link PAY to this clone's remote
pm link --project PAY --force  # replace another repository linked to PAY
pm link --clear                # unlink this clone's project
pm link --file --project PAY   # write .pm.json at the repository root instead
pm link --file --here --project WEB   # .pm.json in this folder (monorepo subproject)
pm whoami                      # Project  PAY (from git remote gitlab.com/reddevs/payments)
```

`pm tasks list` still spans every project unless you pass `--project`; only `--milestone <name>` uses
the folder's project to look the name up. When nothing names a project, a command that needs one
exits with code 1 and says how to fix it.

### Instructions for coding agents

`pm agents` writes how to use pm into the repository's `AGENTS.md` (or `CLAUDE.md` when only that
exists), between `<!-- pm:start ... -->` and `<!-- pm:end -->`. It names the folder's project when pm
can find it. Run it again after upgrading pm: it replaces only that block.

```sh
pm agents                      # AGENTS.md, else CLAUDE.md, at the repository root
pm agents --file docs/AI.md    # another file
pm agents --print              # print the block instead
```

## Commands

```sh
pm dashboard                                    # Mine: your tasks, your agents' tasks and mentions of you
pm dashboard --everyone                         # the whole workspace
pm dashboard --json                             # { schema: 'pm.v1.dashboard', data: Dashboard }

pm projects list                                # with each project's linked repository
pm projects delete PAY --confirm PAY            # owners and admins; cannot be undone

pm tasks list                                   # every project you can read
pm tasks list --mine                            # your tasks in every project
pm tasks list --project PAY --status todo,in_progress --assignee me --limit 20
pm tasks list --project PAY,WEB --assignee agents
pm tasks list --project PAY --milestone "Webhooks v2" --cycle current
pm tasks list --project PAY --milestone none --cycle none
pm tasks show PAY-142
pm tasks create --project PAY "Retry failed webhooks" --priority high --assignee claude-dev
pm tasks create "Retry failed webhooks"          # in a clone linked to PAY
pm tasks create --project PAY "Retry failed webhooks" --milestone "Webhooks v2" --cycle next
git log -1 --format=%B | pm tasks create --project PAY "Follow up on the release" --description -
pm tasks update PAY-142 --status in_review
pm tasks update PAY-142 --assignee "Ana Ruiz" --priority urgent
pm tasks update PAY-142 --unassign
pm tasks update PAY-142 --milestone "Webhooks v2" --cycle 12
pm tasks update PAY-142 --milestone none --cycle none

pm comments list PAY-142
pm comments add PAY-142 "Ready for review, @ana@example.com"
pnpm test 2>&1 | tail -20 | pm comments add PAY-142 -
pm comments edit <comment-id> "New body"
pm comments delete <comment-id>

pm milestones list --project PAY
pm milestones create --project PAY "Webhooks v2" --target 2026-11-14 --description -
pm milestones update "webhooks v2" --project PAY --target none --status completed
pm milestones update <milestone-id> --name "Webhooks v3"

pm cycles list --project PAY
pm cycles create --project PAY --starts 2026-10-26 --ends 2026-11-08 --name "Checkout rewrite"
pm cycles create --project PAY                  # the day after the last cycle, same length
pm cycles current --project PAY
pm cycles end --project PAY                     # the current cycle
pm cycles end 12 --project PAY --move-to none

pm backlog status --project PAY                 # where the mirror reads from, last read, counts
pm backlog status --problems                    # every file skipped or read with a warning, unmapped values
pm backlog refresh                              # queue a read of the default branch now
pm backlog refresh --wait                       # wait for it (up to 5 minutes) and report how it went
```

- Project and task keys are case-insensitive (`pay-142` works). Subtasks mirrored from Backlog.md have
  suffixed keys (`PAY-786.1`, `PAY-786.1.2`).
- Statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`. `in-progress` and
  `"In progress"` are accepted too.
- Priorities: `none`, `low`, `medium`, `high`, `urgent`.
- `--assignee` takes `me`, a member's name or email, or a user id. `pm tasks list` also takes `agents`;
  `--mine` is short for `--assignee me`.
- `pm tasks list` without `--project` spans every project the key can read. `--project` repeats or
  takes a comma-separated list.
- `--description -` and a comment body of `-` read the text from stdin.
- `pm tasks list` returns 50 tasks by default (up to 200 with `--limit`). When there are more, it prints
  a cursor; pass it with `--cursor` to get the next page.
- `pm projects delete` deletes the project with its tasks, comments, history, milestones, cycles and
  Backlog.md mirror. There is no undo. `--confirm` must repeat the key (any case); without it, or with
  another key, pm exits with code 1 ("Pass --confirm PAY to delete project PAY.") and sends nothing. It
  needs an owner or admin, with a person's key that has whole-workspace access and write permission.
  Agents get exit code 4, an unknown project 3.

### Milestones and cycles

- `--milestone` takes a milestone id or its name, ignoring case. Names are looked up in the project:
  `--project` (or the folder's project) for `pm tasks list` (exactly one), `pm tasks create` and
  `pm milestones update`, the task key's project for `pm tasks update`. An unknown name fails with
  exit code 1 and lists the project's milestones.
- `--cycle` takes a cycle number, `current` or `next`. `none` clears it on `pm tasks update` and
  filters tasks without a cycle on `pm tasks list`.
- `--target none` clears a milestone's target date. Setting any status but `completed` on a completed
  milestone reopens it as `active`.
- `pm cycles current` prints `null` data with `--json` (exit code 0) when the project has no current
  cycle.
- `pm cycles end` ends the current cycle unless you pass a number. Unfinished tasks move to
  `--move-to` (a cycle number, or `none`), else the next upcoming cycle, else a new cycle of the same
  length.

### Dashboard

- `pm dashboard` prints what needs someone now. Four groups (In review, Mentions, Stalled, Deadlines),
  each with its total and up to 10 lines, then `… N more`. Then one row per project (open, doing, review,
  current cycle, next milestone, last activity) and the agents (who they work for, current task or Idle,
  stalled marker).
- Mine covers your tasks, the tasks of the agents you are responsible for, and mentions of you. For an
  agent's key, Mine means the agent's own tasks and mentions of it. `--everyone` covers every project
  the key can read.
- Use `--json` for every item (up to 50 per group); each group's `total` counts them all.

With an agent's key:

```text
$ pm dashboard
Needs you · 5

In review · 1
  PAY-5  Webhook signature check accepts expired timestamps  claude-dev for Ana Ruiz  in review 3h

Mentions · 1
  PAY-1  Ana Ruiz  Thanks @claude-dev, looks good.  25m ago

Stalled · 1
  WEB-1  Dark mode flickers on first load  claude-dev for Ana Ruiz  no update 26h

Deadlines · 2
  WEB  Cycle 1 · Settings polish   0/3 done  3 open  ends tomorrow
  PAY  Cycle 1 · Checkout rewrite  0/6 done  6 open  ends in 2 days
```

The projects table and the agents follow. An empty group prints one line, `Mentions · none`.

### Comments

- Comment bodies are Markdown, up to 20,000 characters. `@agent-name` and `@email` mention workspace
  members; the server rewrites them to `[@Name](mention:<userId>)` links. Unknown names stay plain text.
- Only the author edits or deletes a comment, agents included. A deleted comment stays in the history
  as "Comment deleted by ...".
- `pm tasks show` prints the task's history: activity as one line each, comments as indented blocks
  with their author, "for" the agent's human, the time and the comment id.

### Backlog.md mirrors

A project can mirror a Backlog.md folder from its repository (set up in the project's settings on the
web). Its tasks keep their Backlog.md numbers: `BACK-786.1` becomes `PAY-786.1`.
- Every command that takes a task key also takes the Backlog.md id: `pm tasks show BACK-786.1`. An app
  key wins over an id with the same text. Ids like `TASK-12` can repeat across projects: pm looks the
  id up in `--project`, `PM_PROJECT` or `.pm.json` when one is set, and in the project linked to the
  clone's remote when the id alone is not enough.
- Backlog.md owns title, description, status, priority, assignee and milestone of a mirrored task, and
  every milestone of the project. Changing one fails with exit code 6 and says where to change it:

  ```
  $ pm tasks update PAY-786 --status done
  error: PAY-786 is mirrored from Backlog.md, so its status can't change here (task_mirrored).
    file:  backlog/tasks/back-786 - Retry-failed-webhook-deliveries-with-exponential-backoff.md (main)
    edit the file and push, or run: backlog task edit 786 -s Done
    still allowed here: comments (pm comments add PAY-786) and cycles (pm tasks update PAY-786 --cycle 4)
  ```

  New tasks and milestones of a mirrored project are added in Backlog.md too (`project_mirrored`,
  `milestone_mirrored`). With `--json` the error is the problem as the server sent it, with `field`,
  `file`, `backlogId` and `hint`.
- `pm tasks show` adds the Backlog.md id and file, the locked fields, and "Hidden" for a task whose file
  is gone from the default branch. Changes a refresh made show as "Backlog.md" with the commit.
- `pm backlog refresh` needs an owner, an admin, or an agent whose key can write the project. It fails
  with exit code 6 when the mirror is paused (`BACKLOG_PAUSED`: the connection is missing, rejected or
  unreachable) or detached (`BACKLOG_DETACHED`). `--wait` checks the status every 2 seconds until the
  read ends, up to 5 minutes; it exits 0 whatever the read found, so check `state` in the JSON
  (`healthy`, `warnings`, `failed`, `paused`). `outcome` is `queued` without `--wait`, `finished`, or
  `timeout` when no read ended in time (is the worker running?).

Human output is a compact table with task keys first. Agents show as "claude-dev for Ana Ruiz": the agent
and the person responsible for it. Colour is used only when stdout is a terminal.

## JSON output

Every command takes `--json` and prints one versioned result:

```json
{
  "schema": "pm.v1.tasks.show",
  "data": { "task": { "key": "PAY-142", "...": "..." }, "activity": [], "timeline": [] }
}
```

| Command                | Schema                    |
| ---------------------- | ------------------------- |
| `pm login`             | `pm.v1.login`             |
| `pm logout`            | `pm.v1.logout`            |
| `pm whoami`            | `pm.v1.whoami`            |
| `pm dashboard`         | `pm.v1.dashboard`         |
| `pm projects list`     | `pm.v1.projects.list`     |
| `pm projects delete`   | `pm.v1.projects.delete`   |
| `pm tasks list`        | `pm.v1.tasks.list`        |
| `pm tasks show`        | `pm.v1.tasks.show`        |
| `pm tasks create`      | `pm.v1.tasks.create`      |
| `pm tasks update`      | `pm.v1.tasks.update`      |
| `pm comments list`     | `pm.v1.comments.list`     |
| `pm comments add`      | `pm.v1.comments.add`      |
| `pm comments edit`     | `pm.v1.comments.edit`     |
| `pm comments delete`   | `pm.v1.comments.delete`   |
| `pm milestones list`   | `pm.v1.milestones.list`   |
| `pm milestones create` | `pm.v1.milestones.create` |
| `pm milestones update` | `pm.v1.milestones.update` |
| `pm cycles list`       | `pm.v1.cycles.list`       |
| `pm cycles create`     | `pm.v1.cycles.create`     |
| `pm cycles current`    | `pm.v1.cycles.current`    |
| `pm cycles end`        | `pm.v1.cycles.end`        |
| `pm link`              | `pm.v1.link`              |
| `pm agents`            | `pm.v1.agents`            |
| `pm backlog status`    | `pm.v1.backlog.status`    |
| `pm backlog refresh`   | `pm.v1.backlog.refresh`   |
| any failure            | `pm.v1.error`             |

The data schemas live in `@pm/contracts` (`cliDataSchemas`, `parseCliOutput`). Within `v1`, fields are
only ever added; removing or changing a field needs `pm.v2`. JSON is printed on one line when piped and
indented at a terminal.

With `--json`, failures print `pm.v1.error` on stdout: an RFC 9457 problem with `code`, `status`,
`detail`, and `requestId` and `issues` when the server sent them (`field`, `file`, `backlogId` and `hint`
for the Backlog.md mirror errors). The exit code is still non-zero.

`pm.v1.projects.delete` is `{ "deleted": "PAY" }`.

`pm.v1.backlog.status` holds the first 50 problems unless you pass `--problems`, which reads them all.
`pm.v1.backlog.refresh` is the refresh request plus `outcome` and, with `--wait`, the final `status`.

`pm.v1.tasks.show` keeps `activity` for v1 readers and adds `timeline`: activity and comments in one
list, oldest first, told apart by `kind` (`activity` or `comment`).

## Exit codes

| Code | Meaning                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| 0    | OK                                                                                          |
| 1    | Usage: bad arguments, unknown milestone names, or input the server rejected (400, 409, 422) |
| 2    | Auth: not logged in, or the key was refused (401)                                           |
| 3    | Not found (404)                                                                             |
| 4    | Forbidden: the key's scope or access does not allow it, or owners and admins only (403)     |
| 5    | Server: unreachable, 5xx, or a response this version does not understand                    |
| 6    | Backlog.md: the change belongs in Backlog.md, or the mirror is paused or detached (409)     |

## Development

```sh
pnpm --filter @pm/cli dev tasks list --project PAY      # run from source with tsx
pnpm --filter @pm/cli test                             # needs Postgres: docker compose -f docker-compose.dev.yml up -d db
pnpm --filter @pm/cli build
```

The tests run every command in-process against the real `/api/v1` handler from `apps/web` on a throwaway
database seeded with the dev data, and validate each `--json` result against the contract schemas.

To try the CLI against a local server:

```sh
eval "$(pnpm -s --filter web seed)"      # prints PM_API_KEY for the claude-dev agent
pnpm --filter web dev
node apps/cli/dist/index.js login --key "$PM_API_KEY"
node apps/cli/dist/index.js tasks list --project PAY
```
