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
Project    PAY (from git remote gitlab.com/reddevs/payments)
```

## Link the repository to its project

Link each project to the repository its code lives in, once. Then an agent working in any clone of it
can leave out `--project`: pm finds the project from the clone's git remote.

```sh
cd payments                 # a clone of gitlab.com/reddevs/payments
pm link --project PAY       # or set Repository in the project's Edit project dialog
pm agents                   # write the pm instructions into AGENTS.md, naming PAY
git add AGENTS.md && git commit -m "Add pm instructions for agents"
```

`pm link` needs a key that can edit the project. A repository belongs to one project; linking it to a
second one fails with exit code 1 and names the first. HTTPS and SSH URLs of the same repository match.

Other ways to set the project, in the order pm checks them: `--project`, the `PM_PROJECT` variable, the
nearest committed `.pm.json` (`{ "project": "PAY" }`, written by `pm link --file`; useful when one
repository holds several projects, one file per subfolder), then the linked remote. `pm whoami` shows
which one applies in the current folder.

`pm agents` puts a short block between `<!-- pm:start ... -->` and `<!-- pm:end -->` in `AGENTS.md`, or in
`CLAUDE.md` when only that exists. It covers the loop below, `--json` and the exit codes. Run it again
after upgrading pm; it replaces only its own block. `pm agents --print` shows the block without writing it.

A typical loop for an agent:

```sh
pm dashboard --json                     # reviews, mentions of the agent, stalled work, deadlines
pm tasks list --mine --status todo --cycle current --json
pm tasks update PAY-142 --status in_progress
pm tasks show PAY-142 --json
pm comments add PAY-142 "Tests pass. Ready for review, @ana@example.com"
pm tasks update PAY-142 --status in_review
```

`--mine` lists the tasks assigned to the key's owner across every project the key can read. Add `--project`
to narrow it to one or more projects.

Tell the agent about the exit codes so it can react without parsing text:

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | OK                                                                   |
| 1    | Usage error, or the server rejected the input (400, 409, 422)        |
| 2    | Not logged in, or the key was refused (401): revoked or wrong        |
| 3    | Not found (404)                                                      |
| 4    | Forbidden: outside the key's scope, or a read-only key writing (403) |
| 5    | Server unreachable, 5xx, or a response this CLI does not understand  |

## Comments and mentions

Agents comment on tasks the way people do, and the comment shows in the task's history in the web app as
"claude-dev for Ana Ruiz". The body is Markdown, up to 20,000 characters.

```sh
pm comments add PAY-142 "Picked this up. @ana@example.com, I will open the MR today."
pnpm test 2>&1 | tail -20 | pm comments add PAY-142 -     # "-" reads the body from stdin
pm comments list PAY-142
pm comments edit 01a16848-b25a-7da5-aceb-752a314e6b85 "Fixed: the MR is !42."
pm comments delete 01a16848-b25a-7da5-aceb-752a314e6b85
```

Mention someone with `@` and their email (`@ana@example.com`) or an agent's name (`@claude-dev`). The
server checks that they are members of the workspace and stores the mention as a link,
`[@Ana Ruiz](mention:<userId>)`, which the web app shows as a name chip. An `@word` that matches nobody
stays plain text. Mentions send no notification yet.

Only the author can edit or delete a comment. That holds for agents too: the agent's responsible human
cannot edit the agent's comments, and an agent trying to delete a person's comment gets exit code 4.
Deleting leaves "Comment deleted by ..." in the history. Comment ids are in `pm comments list`, in
`pm tasks show` and in the `--json` output.

`pm tasks show PAY-142` prints the history: activity on one line each, comments as indented blocks with
their id.

## Milestones and cycles

Projects can group tasks into milestones (a goal with an optional target date) and cycles (numbered,
dated periods of work, usually two weeks). Both are on by default. Anyone who can edit a project can turn either off in
its Edit project dialog in the web app; the data stays and comes back when you turn it on again.

Milestones go by name or id. Names are unique in a project and the CLI ignores case:

```sh
pm milestones list --project PAY
pm milestones create --project PAY "Payout reports" --target 2026-12-04
pm tasks update PAY-142 --milestone "payout reports"
pm tasks list --project PAY --milestone "Payout reports"
pm milestones update "payout reports" --project PAY --status completed
```

A milestone starts as Planned and turns Active by itself when one of its tasks moves to In progress or In
review. Only a person or agent marks it Completed. An unknown name fails with exit code 1 and lists the
project's milestones, so an agent can retry with the right one.

Cycles go by number, or by `current` and `next`:

```sh
pm cycles current --project PAY
pm tasks list --mine --cycle current
pm tasks update PAY-142 --cycle next
pm cycles create --project PAY                   # the day after the last cycle, same length
pm cycles end --project PAY                      # ends the current cycle early
```

`pm cycles current --json` prints `"data": null` with exit code 0 when no cycle is running. When a cycle
ends, early by hand or at midnight after its end date (in the server's `APP_TIME_ZONE`), its unfinished
tasks move to the next cycle; the server creates one with the same length when none is planned.
`pm cycles end --move-to none` takes them out of cycles instead. `--milestone none` and `--cycle none`
clear the field on `pm tasks update` and filter tasks without one on `pm tasks list`.

## Dashboard

`pm dashboard` shows what needs someone now, across every project the key can read. It prints the same data
as the Dashboard page in the web app.

```sh
pm dashboard               # Mine: your tasks, your agents' tasks and mentions of you
pm dashboard --everyone    # the whole workspace
pm dashboard --json        # { schema: 'pm.v1.dashboard', data: Dashboard }
```

The output starts with the action queue, in four groups:

| Group     | An item stays while                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In review | The task is In review.                                                                                                                                           |
| Mentions  | A comment mentions the member, the task is open, and the member has not commented on the task or changed it since. A reply by the member's agent does not count. |
| Stalled   | The task is In progress with no update or comment for 24 hours when an agent holds it, or 5 days otherwise.                                                      |
| Deadlines | A milestone is past its target date with open tasks, or the current cycle ends within 2 days with open tasks.                                                    |

Items leave the queue on their own when the condition clears; nobody dismisses them. After the queue come one
row per project (open, in progress and in review counts, current cycle, next milestone, last activity) and
the agents (who they work for, their current task or Idle, and whether it is stalled).

For a person, Mine covers the tasks assigned to them or to the agents they are responsible for, and mentions
of them. For an agent's key, Mine means the agent's own tasks and mentions of the agent. `--everyone` covers
every task and every mention in the projects the key can read. The key's project scope applies in both.

### Ask your person for input

When you need input from a person, mention your responsible person in a comment (@their-email); that puts
it on their dashboard. It stays under Mentions until they comment on the task or change it.

```sh
pm comments add PAY-142 "Refunds over 500 EUR: one approval or two? @ana@example.com"
pm tasks update PAY-142 --status in_review    # your task in review shows on their dashboard too
```

Your own dashboard works the same way: `pm dashboard` lists the comments that mention you and your tasks
in review or stalled, so check it when you start a session.

### pm.v1.dashboard

`pm dashboard --json` prints the body of `GET /api/v1/dashboard?scope=mine|everyone`:

```json
{
  "schema": "pm.v1.dashboard",
  "data": {
    "scope": "mine",
    "generatedAt": "2026-10-23T17:12:30.413Z",
    "groups": {
      "review": { "total": 1, "items": [] },
      "mentions": { "total": 1, "items": [] },
      "stalled": { "total": 0, "items": [] },
      "deadlines": { "total": 2, "items": [] }
    },
    "projects": [],
    "agents": []
  }
}
```

Each group has `total`, which counts every item, and `items`, up to 50 of them. The items:

| Group       | Item                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review`    | `{ task, assignee, since }`: `since` is when the task last entered In review.                                                                       |
| `mentions`  | `{ task, comment: { id, excerpt, createdAt }, author, onBehalfOf, mentioned }`: the newest unanswered mention per task and member.                  |
| `stalled`   | `{ task, assignee, lastTouchedAt, thresholdHours }`                                                                                                 |
| `deadlines` | `{ kind: "milestone", project, milestone, daysOverdue, openTasks, progress }` or `{ kind: "cycle", project, cycle, daysLeft, openTasks, progress }` |

`task` is `{ key, title, status, priority, project: { key, name } }`. `excerpt` is plain text of at most
200 characters: mentions read `@Name` and inline code keeps its backticks. A project row has `key`, `name`,
`openCounts`, `openCount`, `usesMilestones`, `usesCycles`, `lastActivityAt`, `currentCycle` and
`nextMilestone`. An agent row has `agent`, `currentTask` (null when idle), `inProgressCount`, `stalled` and
`lastActivityAt`. `GET /api/v1/dashboard/counts` returns only the Mine totals:
`{ review, mentions, stalled, deadlines, total }`.

## --json output

Every command takes `--json` and prints one line with a versioned envelope:

```json
{ "schema": "pm.v1.<command>", "data": {} }
```

Check `schema` before reading `data`. Within `pm.v1`, fields are only added, never removed or changed; a
breaking change ships as `pm.v2`. The Zod schemas live in `packages/contracts` (`cliDataSchemas` in
`src/cli.ts`, entities in `src/entities.ts`), and the server publishes the same shapes as OpenAPI at
`GET /api/v1/openapi.json`.

| Schema                    | `data`                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pm.v1.login`             | `{ url, me }`                                                                |
| `pm.v1.logout`            | `{ url }` (null when nothing was stored)                                     |
| `pm.v1.whoami`            | `{ user, workspace, role, auth: { method, scope }, project }`                |
| `pm.v1.dashboard`         | `{ scope, generatedAt, groups, projects, agents }` (see Dashboard above)     |
| `pm.v1.projects.list`     | `{ items: Project[] }` with open counts per status                           |
| `pm.v1.tasks.list`        | `{ items: TaskListItem[], nextCursor, counts }`                              |
| `pm.v1.tasks.show`        | `{ task: Task, activity: Activity[], timeline: TimelineEntry[] }`            |
| `pm.v1.tasks.create`      | `Task`                                                                       |
| `pm.v1.tasks.update`      | `Task`                                                                       |
| `pm.v1.comments.list`     | `{ items: Comment[] }`                                                       |
| `pm.v1.comments.add`      | `Comment`                                                                    |
| `pm.v1.comments.edit`     | `Comment`                                                                    |
| `pm.v1.comments.delete`   | `Comment`, with `body` null and `deletedAt` set                              |
| `pm.v1.milestones.list`   | `{ items: Milestone[] }` with progress counts                                |
| `pm.v1.milestones.create` | `Milestone`                                                                  |
| `pm.v1.milestones.update` | `Milestone`                                                                  |
| `pm.v1.cycles.list`       | `{ items: Cycle[] }` with state, days left and counts                        |
| `pm.v1.cycles.create`     | `Cycle`                                                                      |
| `pm.v1.cycles.current`    | `Cycle`, or `null` when no cycle is running                                  |
| `pm.v1.cycles.end`        | `Cycle` with its summary, plus `rollovers`: the tasks that moved and where   |
| `pm.v1.link`              | `{ project, target, action, repository, file }`                              |
| `pm.v1.agents`            | `{ file, action, project, block }`                                           |
| `pm.v1.error`             | RFC 9457 problem: `{ type, title, status, code, detail, requestId, issues }` |

Statuses are `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`. Priorities are `none`, `low`,
`medium`, `high`, `urgent`. Timestamps are ISO 8601 in UTC; dates such as `targetDate` and `startsOn` are
`YYYY-MM-DD`. `assignee` is null or a user reference; agents carry their `responsible` person. `milestone`
and `cycle` are null when the task has none. `rank` orders the cards inside a board column.

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
        "project": { "id": "01a1657a-f8e2-715c-91fd-dd9329a8ca32", "key": "PAY", "name": "Payments" },
        "status": "todo",
        "priority": "none",
        "assignee": null,
        "milestone": {
          "id": "01a16848-785e-725d-ad8d-07f37cc5360a",
          "name": "Webhooks v2",
          "status": "active",
          "targetDate": "2026-11-14"
        },
        "cycle": {
          "id": "01a16848-7867-7a12-8a90-2dd6fb6deaf8",
          "number": 1,
          "name": "Checkout rewrite",
          "startsOn": "2026-10-12",
          "endsOn": "2026-10-25",
          "state": "current"
        },
        "cycleAddedAt": "2026-10-22T21:18:41.187Z",
        "rank": -1,
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

`timeline` holds the same activity entries plus the comments, oldest first, each with a `kind` of
`activity` or `comment`. A comment entry:

```json
{
  "kind": "comment",
  "id": "01a16848-b25a-7da5-aceb-752a314e6b85",
  "taskKey": "PAY-1",
  "author": { "id": "01a1657b-0515-750b-b667-2218bd07a9bc", "name": "claude-dev", "kind": "agent" },
  "onBehalfOf": { "id": "01a1657a-f4bd-7d42-bf4e-e13a06462256", "name": "Ana Ruiz", "kind": "person" },
  "body": "Picked this up. [@Ana Ruiz](mention:01a1657a-f4bd-7d42-bf4e-e13a06462256), I will open the MR today.",
  "mentions": [{ "id": "01a1657a-f4bd-7d42-bf4e-e13a06462256", "name": "Ana Ruiz", "kind": "person" }],
  "createdAt": "2026-10-22T21:19:05.142Z",
  "editedAt": null,
  "deletedAt": null
}
```

When a cycle ends, each task that moved gets a `cycle.ended` activity entry with a `cycle` change. Its
`actor` is null when the server's hourly job ended the cycle.

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
