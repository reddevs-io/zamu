<img src="assets/icon.svg" width="64" height="64" alt="">

# project-management

A self-hosted project management tool for teams where AI coding agents work next to people. Agents are members
of the workspace with their own scoped API keys, and every change they make reads "claude-dev for Ana Ruiz":
the agent, and the person it acts for. People use the web app; agents use the `pm` CLI.

![Task list of the Payments project with the task pane open](docs/images/task-list-light.png)

What works today (milestone M4):
- First-run setup, email and password sign-in, single sign-on with OpenID Connect, invitations by link.
- A dashboard, the page you land on: tasks in review, unanswered mentions, stalled work and close deadlines
  across every project, for you or the whole workspace, then one row per project and the agents.
- Projects and tasks: a keyboard-first task list (J/K or the arrow keys, Left and Right to collapse and
  expand a status group, C to create, Esc), a task pane and a task page, with status, priority, assignee
  and a Markdown description. Owners and admins can delete a project from its settings or with
  `pm projects delete`.
- A board per project, one column per status. Move cards by drag and drop or with Shift+H/J/K/L, undo with
  Ctrl+Z, and split the board into swimlanes by assignee or milestone. V switches between list and board.
- Milestones with a target date and progress, and numbered cycles. A cycle ends at midnight after its end
  date, or early by hand, and moves its unfinished tasks to the next one.
- Comments in the task history, in Markdown, with @mentions of people and agents. The history shows
  comments and changes in one list.
- My tasks: everything assigned to you, across projects.
- Backlog.md: a project can mirror the task files a repository keeps in `backlog/`, following the default
  branch on every push, or import them once and move off Backlog.md. It reads through a workspace git
  connection to GitHub, GitLab or Gitea/Forgejo with a read-only token.
- Light, dark or system theme, saved to your account.
- Agents with API keys scoped to some or all projects, read only or read and write, revocable at any time.
- The `pm` CLI with `--json` output and stable exit codes, over a REST API at `/api/v1` with an OpenAPI
  document. Agents comment, plan with milestones and cycles, list their own tasks with `--mine`, and see
  what needs them with `pm dashboard`.
- One Docker image (web, worker, migrations) and a docker compose file. Postgres is the only stateful service.

## Quickstart

You need Docker with the Compose plugin.

```sh
git clone https://gitlab.com/reddevsdotio/tooling/project-management.git
cd project-management
cp .env.example .env
# set BETTER_AUTH_SECRET in .env, for example to the output of: openssl rand -base64 32
docker compose up -d --build
```

Open http://localhost:3000, create the admin account and name your workspace. Create a project, then add an
agent in Settings > Members and copy its key. The image ships the CLI, so you can try the key right away:

```sh
docker compose exec -e PM_KEY=pm_live_... web pm tasks list --project PAY
```

On the agent's machine, build the CLI and set `PM_URL` and `PM_KEY`, as described in
[docs/agents.md](docs/agents.md).

## Docs

- [Self-hosting](docs/self-hosting.md): configuration, first run, ports, backups and upgrades.
- [Agents](docs/agents.md): adding agents, scoping keys, running `pm` in an agent's environment, `--json` output.
- [Backlog.md](docs/backlog-md.md): git connections, mirrors and imports, mappings, webhooks, detach.
- [CLI reference](apps/cli/README.md): every `pm` command and option.

## Development

Node 24 and pnpm (the version in `package.json`):

```sh
pnpm install
cp .env.example .env                                   # then set BETTER_AUTH_SECRET
docker compose -f docker-compose.dev.yml up -d db      # Postgres on localhost:5432
pnpm --filter @pm/db migrate
pnpm dev                                               # web app on http://localhost:3000, plus the worker
```

Checks:

```sh
pnpm lint
pnpm typecheck
pnpm test                                     # Vitest against a throwaway Postgres database
pnpm exec playwright install chromium         # once
pnpm e2e                                      # Playwright against the docker compose stack
```

`pnpm e2e` builds the CLI and the image, starts the compose stack as project `pm-e2e` on a fresh volume at
http://localhost:3100 and runs the specs in `e2e/`, then removes the stack. It leaves the development
database alone. The specs share one server and admin account: whichever runs first sets the server up, the
others sign in, so each spec also runs alone (`pnpm e2e e2e/<spec>`). The stack sets `APP_ENCRYPTION_KEY`
and the git settings the Backlog.md specs need (`e2e/stack.ts`).
- `dashboard.spec.ts`: the dashboard. An agent puts a task in review and mentions its person from the CLI,
  the person answers the mention from the dashboard with the keyboard, the rail count follows, and
  `pm dashboard --json` matches the API.
- `person-and-agent.spec.ts`: the M1 flow, from setup (or sign-in) to an agent working through the CLI.
- `project-delete.spec.ts`: deleting a project from its settings and with `pm projects delete`, including the
  refused cases and the keys that covered it.
- `upgrade.spec.ts`: starts a second stack (`pm-e2e-upgrade`, port 3101) on release 0.1.1 and adds data,
  switches it to M2.1 (0.3.0) and adds more, then switches it to the new image and checks that every key
  and route still works. The older images come from `E2E_M1_IMAGE` and `E2E_M2_1_IMAGE` (pulled when
  missing), or are built once from git as `project-management:m1-0.1.1` and `project-management:m2.1-<ref>`,
  which takes a few minutes each the first time.
- `work-views.spec.ts`: the board, milestones, cycles, comments with mentions from the web and the CLI,
  the task list keys around group rows, My tasks and the theme.
- `backlog-mirror.spec.ts` and `backlog-import.spec.ts` (Playwright project `backlog-md`, after the others):
  each starts its own Forgejo container from `docker/forgejo/`, attaches it to the stack's network and
  removes it at the end. They cover connections, setup and the Mappings step's suggestions, the mirrored
  views, webhooks and a new webhook secret, refreshes, `pm backlog`, refused changes, Edit mappings, detach,
  deleting a mirrored project and import.

`E2E_KEEP_STACK=1` keeps the stacks (and the Forgejo containers) running after the run, `E2E_SKIP_BUILD=1`
reuses the last image, `E2E_COMPOSE_PROJECT`, `E2E_PORT`, `E2E_UPGRADE_PORT` and `PM_IMAGE` change the
project name, ports and image tag (use them when another checkout runs the suite on the same machine),
`E2E_SKIP_UPGRADE=1` skips the upgrade test and `E2E_SKIP_BACKLOG=1` skips the Backlog.md specs.

`pnpm dev` without `BETTER_AUTH_SECRET` prints the startup error once and keeps running; pages fail until
you set it. A built server, such as the one in the image, exits instead.

To see the dashboard's query plans on a large workspace (100 projects, 100k tasks), run
`pnpm exec tsx packages/core/scripts/dashboard-stress.ts --help`. It creates and drops its own database on
the Postgres in `STRESS_DATABASE_URL` or `TEST_DATABASE_URL`.

## License

[MIT](LICENSE)
