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
pm tasks list --project PAY
pm tasks list --project PAY --status todo,in_progress --assignee me --limit 20
pm tasks list --project PAY --assignee agents
pm tasks show PAY-142
pm tasks create --project PAY "Retry failed webhooks" --priority high --assignee claude-dev
git log -1 --format=%B | pm tasks create --project PAY "Follow up on the release" --description -
pm tasks update PAY-142 --status in_review
pm tasks update PAY-142 --assignee "Ana Ruiz" --priority urgent
pm tasks update PAY-142 --unassign
```

- Project and task keys are case-insensitive (`pay-142` works).
- Statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`. `in-progress` and
  `"In progress"` are accepted too.
- Priorities: `none`, `low`, `medium`, `high`, `urgent`.
- `--assignee` takes `me`, a member's name or email, or a user id. `pm tasks list` also takes `agents`.
- `--description -` reads the Markdown description from stdin.
- `pm tasks list` returns 50 tasks by default (up to 200 with `--limit`). When there are more, it prints
  a cursor; pass it with `--cursor` to get the next page.

Human output is a compact table with task keys first. Agents show as "claude-dev for Ana Ruiz": the agent
and the person responsible for it. Colour is used only when stdout is a terminal.

## JSON output

Every command takes `--json` and prints one versioned result:

```json
{ "schema": "pm.v1.tasks.show", "data": { "task": { "key": "PAY-142", "...": "..." }, "activity": [] } }
```

| Command            | Schema                |
| ------------------ | --------------------- |
| `pm login`         | `pm.v1.login`         |
| `pm logout`        | `pm.v1.logout`        |
| `pm whoami`        | `pm.v1.whoami`        |
| `pm projects list` | `pm.v1.projects.list` |
| `pm tasks list`    | `pm.v1.tasks.list`    |
| `pm tasks show`    | `pm.v1.tasks.show`    |
| `pm tasks create`  | `pm.v1.tasks.create`  |
| `pm tasks update`  | `pm.v1.tasks.update`  |
| any failure        | `pm.v1.error`         |

The data schemas live in `@pm/contracts` (`cliDataSchemas`, `parseCliOutput`). Within `v1`, fields are
only ever added; removing or changing a field needs `pm.v2`. JSON is printed on one line when piped and
indented at a terminal.

With `--json`, failures print `pm.v1.error` on stdout: an RFC 9457 problem with `code`, `status`,
`detail`, and `requestId` and `issues` when the server sent them. The exit code is still non-zero.

## Exit codes

| Code | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| 0    | OK                                                                       |
| 1    | Usage: bad arguments or input the server rejected (400, 409, 422)        |
| 2    | Auth: not logged in, or the key was refused (401)                        |
| 3    | Not found (404)                                                          |
| 4    | Forbidden: the key's scope or access does not allow it (403)             |
| 5    | Server: unreachable, 5xx, or a response this version does not understand |

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
