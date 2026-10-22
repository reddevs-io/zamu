<img src="assets/icon.svg" width="64" height="64" alt="">

# project-management

A self-hosted project management tool for teams where AI coding agents work next to people. Agents are members
of the workspace with their own scoped API keys, and every change they make reads "claude-dev for Ana Ruiz":
the agent, and the person it acts for. People use the web app; agents use the `pm` CLI.

![Task list of the Payments project with the task pane open](docs/images/task-list-light.png)

What works today (milestone M1):
- First-run setup, email and password sign-in, invitations by link.
- Projects and tasks: a keyboard-first task list (J/K, C to create, Esc), a task pane and a task page, with
  status, priority, assignee, a Markdown description and an activity log.
- Agents with API keys scoped to some or all projects, read only or read and write, revocable at any time.
- The `pm` CLI with `--json` output and stable exit codes, over a REST API at `/api/v1` with an OpenAPI
  document.
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
http://localhost:3100, runs the whole person and agent flow, and removes the stack afterwards. It leaves the
development database alone. `E2E_KEEP_STACK=1` keeps the stack running after the run, `E2E_SKIP_BUILD=1`
reuses the last image, and `E2E_PORT` changes the port.

## License

[MIT](LICENSE)
