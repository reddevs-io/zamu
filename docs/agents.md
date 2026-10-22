# Agents

An AI coding agent is a member of the workspace, like a person. It has its own name and its own API keys,
and it always acts for one person, its responsible human. Everything the agent changes shows up as
"claude-dev for Ana Ruiz", in the web app and in the CLI.

Agents work through the `pm` CLI. The full command reference is in [apps/cli/README.md](../apps/cli/README.md);
this page covers the setup and what an agent's environment needs.

## Add an agent

Admins add agents in Settings > Members > Add agent:
1. Name the agent, for example `claude-dev`. Names are unique in the workspace.
2. Pick the responsible human. The agent acts for this person.
3. Choose the scope of its first key (see below).
4. Create agent. A dialog shows the key once. Copy it with the copy button, or copy the
   `pm login --key ... --url ...` line under it, then close with "I copied the key".

The server keeps only a hash of the key. If you lose it, revoke it and create a new one.

To give an agent another key later, open the agent's row menu in Settings > Members and pick
Manage keys, then New key. The responsible human can do this too.

## Scope keys

Each key has two settings, chosen when you create it and fixed afterwards:

| Setting    | Options                               | Effect                                                     |
| ---------- | ------------------------------------- | ---------------------------------------------------------- |
| Access     | Whole workspace, or Selected projects | Which projects the key can see. Other projects return 403. |
| Permission | Read and write, or Read only          | Read only can list and show; it cannot create or update.   |

Give each agent the narrowest key that does the job: an agent that works on one repository gets a key for
that project only. Creating projects needs a key with whole-workspace access and write permission.

Revoke a key in Settings > API keys (admins see every key in the
workspace) or from the agent's Manage keys page. It stops working at once: the CLI exits with code 2.
Removing an agent from the workspace disables all of its keys.

People can create keys for themselves in Settings > My keys, for their own scripts.

## Use pm in an agent's environment

The agent's machine needs Node 24 and the CLI. Until `pm` is on npm, build it from this repository:

```sh
pnpm install
pnpm --filter @pm/cli build
alias pm="node $PWD/apps/cli/dist/index.js"
```

Then give the agent two environment variables instead of running `pm login`:

| Variable | Value                                                        |
| -------- | ------------------------------------------------------------ |
| `PM_URL` | The server URL, the same as `BETTER_AUTH_URL` on the server. |
| `PM_KEY` | The agent's API key (`pm_live_...`).                         |

They override the config file that `pm login` writes, so the agent's key never mixes with a person's login on
the same machine. Store `PM_KEY` as a secret in the agent's runner or CI settings, never in the repository.

Check the setup:

```sh
$ pm whoami
claude-dev for Ana Ruiz (agent)
Workspace  Reddevs
Role       member
Access     API key: all projects, write
Server     https://pm.example.com
```

A typical loop for an agent:

```sh
pm tasks list --project PAY --assignee me --status todo --json
pm tasks update PAY-142 --status in_progress
pm tasks show PAY-142 --json
pm tasks update PAY-142 --status in_review
```

Tell the agent about the exit codes so it can react without parsing text:

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | OK                                                                   |
| 1    | Usage error, or the server rejected the input (400, 409, 422)        |
| 2    | Not logged in, or the key was refused (401): revoked or wrong        |
| 3    | Not found (404)                                                      |
| 4    | Forbidden: outside the key's scope, or a read-only key writing (403) |
| 5    | Server unreachable, 5xx, or a response this CLI does not understand  |

## --json output

Every command takes `--json` and prints one line with a versioned envelope:

```json
{ "schema": "pm.v1.<command>", "data": {} }
```

Check `schema` before reading `data`. Within `pm.v1`, fields are only added, never removed or changed; a
breaking change ships as `pm.v2`. The Zod schemas live in `packages/contracts` (`cliDataSchemas` in
`src/cli.ts`, entities in `src/entities.ts`), and the server publishes the same shapes as OpenAPI at
`GET /api/v1/openapi.json`.

| Schema                | `data`                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `pm.v1.login`         | `{ url, me }`                                                                |
| `pm.v1.logout`        | `{ url }` (null when nothing was stored)                                     |
| `pm.v1.whoami`        | `{ user, workspace, role, auth: { method, scope } }`                         |
| `pm.v1.projects.list` | `{ items: Project[] }` with open counts per status                           |
| `pm.v1.tasks.list`    | `{ items: TaskListItem[], nextCursor, counts }`                              |
| `pm.v1.tasks.show`    | `{ task: Task, activity: Activity[] }`                                       |
| `pm.v1.tasks.create`  | `Task`                                                                       |
| `pm.v1.tasks.update`  | `Task`                                                                       |
| `pm.v1.error`         | RFC 9457 problem: `{ type, title, status, code, detail, requestId, issues }` |

Statuses are `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`. Priorities are `none`, `low`,
`medium`, `high`, `urgent`. Timestamps are ISO 8601 in UTC. `assignee` is null or a user reference; agents
carry their `responsible` person.

`pm tasks list --project PAY --json`:

```json
{
  "schema": "pm.v1.tasks.list",
  "data": {
    "items": [
      {
        "id": "01a1657a-fc2c-7636-9dde-ba795eabea62",
        "key": "PAY-1",
        "number": 1,
        "title": "Retry failed webhooks",
        "status": "todo",
        "priority": "none",
        "assignee": null,
        "createdAt": "2026-10-22T21:18:41.187Z",
        "updatedAt": "2026-10-22T21:18:41.187Z"
      }
    ],
    "nextCursor": null,
    "counts": { "backlog": 0, "todo": 1, "in_progress": 0, "in_review": 0, "done": 0, "canceled": 0 }
  }
}
```

`pm tasks show PAY-1 --json` after the agent moved the task:

```json
{
  "schema": "pm.v1.tasks.show",
  "data": {
    "task": {
      "id": "01a1657a-fc2c-7636-9dde-ba795eabea62",
      "key": "PAY-1",
      "number": 1,
      "project": { "id": "01a1657a-f8e2-715c-91fd-dd9329a8ca32", "key": "PAY", "name": "Payments" },
      "title": "Retry failed webhooks",
      "description": null,
      "status": "in_progress",
      "priority": "none",
      "assignee": null,
      "createdBy": { "id": "01a1657a-f4bd-7d42-bf4e-e13a06462256", "name": "Ana Ruiz", "kind": "person" },
      "createdOnBehalfOf": null,
      "createdAt": "2026-10-22T21:18:41.187Z",
      "updatedAt": "2026-10-22T21:18:52.818Z"
    },
    "activity": [
      {
        "id": "01a1657a-fc2f-7009-9f0f-5d5b9a31df9f",
        "type": "task.created",
        "taskKey": "PAY-1",
        "actor": { "id": "01a1657a-f4bd-7d42-bf4e-e13a06462256", "name": "Ana Ruiz", "kind": "person" },
        "onBehalfOf": null,
        "changes": [{ "field": "title", "from": null, "to": "Retry failed webhooks" }],
        "createdAt": "2026-10-22T21:18:41.187Z"
      },
      {
        "id": "01a1657b-2993-7e69-aa1e-e424a15da235",
        "type": "task.updated",
        "taskKey": "PAY-1",
        "actor": { "id": "01a1657b-0515-750b-b667-2218bd07a9bc", "name": "claude-dev", "kind": "agent" },
        "onBehalfOf": { "id": "01a1657a-f4bd-7d42-bf4e-e13a06462256", "name": "Ana Ruiz", "kind": "person" },
        "changes": [{ "field": "status", "from": "todo", "to": "in_progress" }],
        "createdAt": "2026-10-22T21:18:52.814Z"
      }
    ]
  }
}
```

A failure, here `pm tasks show PAY-99 --json` (exit code 3):

```json
{
  "schema": "pm.v1.error",
  "data": {
    "type": "about:blank",
    "title": "Not found",
    "status": 404,
    "code": "NOT_FOUND",
    "detail": "Task PAY-99 not found",
    "requestId": "1edf9f57-2153-41ad-a277-788347720ab6"
  }
}
```

Quote `requestId` when you report a problem. The web container's log names it for server errors
(`docker compose logs web`).
