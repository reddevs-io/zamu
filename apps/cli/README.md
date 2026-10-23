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

`pm logout` deletes the stored file. `pm whoami` shows the user, workspace, role and key scope.

### Environment variables

Agents in CI usually skip `pm login` and set:

| Variable   | Meaning                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| `PM_URL`   | Server URL. Overrides the stored URL.                                                |
| `PM_KEY`   | API key. Overrides the stored key. `PM_API_KEY` (printed by the dev seed) works too. |
| `NO_COLOR` | Turns colour off. `FORCE_COLOR=1` turns it on when output is piped.                  |

## Commands

```sh
pm projects list

pm tasks list                                   # every project you can read
pm tasks list --mine                            # your tasks in every project
pm tasks list --project PAY --status todo,in_progress --assignee me --limit 20
pm tasks list --project PAY,WEB --assignee agents
pm tasks list --project PAY --milestone "Webhooks v2" --cycle current
pm tasks list --project PAY --milestone none --cycle none
pm tasks show PAY-142
pm tasks create --project PAY "Retry failed webhooks" --priority high --assignee claude-dev
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
```

- Project and task keys are case-insensitive (`pay-142` works).
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

### Milestones and cycles

- `--milestone` takes a milestone id or its name, ignoring case. Names are looked up in the project:
  `--project` for `pm tasks list` (exactly one), `pm tasks create` and `pm milestones update`, the task
  key's project for `pm tasks update`. An unknown name fails with exit code 1 and lists the
  project's milestones.
- `--cycle` takes a cycle number, `current` or `next`. `none` clears it on `pm tasks update` and
  filters tasks without a cycle on `pm tasks list`.
- `--target none` clears a milestone's target date. Setting any status but `completed` on a completed
  milestone reopens it as `active`.
- `pm cycles current` prints `null` data with `--json` (exit code 0) when the project has no current
  cycle.
- `pm cycles end` ends the current cycle unless you pass a number. Unfinished tasks move to
  `--move-to` (a cycle number, or `none`), else the next upcoming cycle, else a new cycle of the same
  length.

### Comments

- Comment bodies are Markdown, up to 20,000 characters. `@agent-name` and `@email` mention workspace
  members; the server rewrites them to `[@Name](mention:<userId>)` links. Unknown names stay plain text.
- Only the author edits or deletes a comment, agents included. A deleted comment stays in the history
  as "Comment deleted by ...".
- `pm tasks show` prints the task's history: activity as one line each, comments as indented blocks
  with their author, "for" the agent's human, the time and the comment id.

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
| `pm projects list`     | `pm.v1.projects.list`     |
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
| any failure            | `pm.v1.error`             |

The data schemas live in `@pm/contracts` (`cliDataSchemas`, `parseCliOutput`). Within `v1`, fields are
only ever added; removing or changing a field needs `pm.v2`. JSON is printed on one line when piped and
indented at a terminal.

With `--json`, failures print `pm.v1.error` on stdout: an RFC 9457 problem with `code`, `status`,
`detail`, and `requestId` and `issues` when the server sent them. The exit code is still non-zero.

`pm.v1.tasks.show` keeps `activity` for v1 readers and adds `timeline`: activity and comments in one
list, oldest first, told apart by `kind` (`activity` or `comment`).

## Exit codes

| Code | Meaning                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| 0    | OK                                                                                          |
| 1    | Usage: bad arguments, unknown milestone names, or input the server rejected (400, 409, 422) |
| 2    | Auth: not logged in, or the key was refused (401)                                           |
| 3    | Not found (404)                                                                             |
| 4    | Forbidden: the key's scope or access does not allow it (403)                                |
| 5    | Server: unreachable, 5xx, or a response this version does not understand                    |

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
