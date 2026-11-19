# REST API

The web app, the `zamu` CLI and your scripts use the same REST API at `/api/v1`. The server publishes the full
OpenAPI document at `GET /api/v1/openapi.json`; this page is an overview, with the routes 0.7.0 added.

## Requests

Send an API key as a bearer token. People create keys in Settings > My keys, and agents get theirs from an
admin (see [agents.md](agents.md)):

```sh
curl -H "Authorization: Bearer $ZAMU_KEY" https://projects.example.com/api/v1/tasks?project=PAY
```

A key only reaches the projects in its scope, and a read-only key cannot write. The web app signs its
requests with the session cookie instead.

Bodies are JSON. Query parameters that take several values repeat the name:
`?status=todo&status=in_progress`. Task keys and project keys ignore case, and a task key also accepts the
task's Backlog.md ID.

Errors are RFC 9457 problems with a stable `code`:

```json
{
  "type": "about:blank",
  "title": "Blockers would loop",
  "status": 409,
  "code": "DEPENDENCY_LOOP",
  "detail": "Can't add: PAY-150 already waits on PAY-142.",
  "requestId": "5b47feb0-08c1-4c5a-b79a-82c21b18286d",
  "loop": { "task": "PAY-142", "blocker": "PAY-150" }
}
```

Quote `requestId` when you report a problem.

## Tasks

| Method and path             | What it does                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `GET /tasks`                | List tasks of one or more projects, or of every readable project. |
| `GET /tasks/{key}`          | Get one task with its labels, parent, subtasks and blockers.      |
| `POST /tasks`               | Create a task.                                                    |
| `PATCH /tasks/{key}`        | Change a task. Send only the fields to change.                    |
| `POST /tasks/bulk`          | Change up to 100 tasks at once (0.7.0).                           |
| `GET /tasks/{key}/timeline` | Activity and comments, oldest first.                              |
| `GET /tasks/{key}/comments` | Comments. `POST` adds one.                                        |

### Fields added in 0.7.0

A task now has:
- `labels`: `[{ id, name, color, source }]`. `color` is 1 to 9; `source` is `app`, or `backlog` for labels
  read from Backlog.md files.
- `dueDate`: `YYYY-MM-DD` or null.
- `parent`: `{ key, title, status, assignee }` or null; `subtasks`, and `subtaskProgress: { done, total }`
  with canceled subtasks left out.
- `blockedBy` and `blocks`: tasks of the same project. An entry is `null` when that task is hidden or you
  can't read it (the app shows "Removed task").
- `blocked`: true while any blocker is open.

List rows (`GET /tasks`) carry `labels`, `dueDate`, `blocked`, `subtaskProgress` and `parentKey`.

`POST /tasks` takes `labels` (names; the project creates the ones it doesn't have), `dueDate`, `parent` (a
task key; the new subtask takes the parent's assignee unless you send one) and `blockedBy` (task keys).

`PATCH /tasks/{key}` takes:
- `labels` to replace every label, or `addLabels` and `removeLabels` to change some, by name;
- `dueDate`, null to clear it;
- `parent`, null to make the task top level again;
- `addBlockers` and `removeBlockers`, task keys.

The rules:

| Code               | Status | When                                                                                                              |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `DEPENDENCY_LOOP`  | 409    | A blocker would close a loop. `loop` names the two tasks.                                                         |
| `SUBTASK_DEPTH`    | 409    | The parent is a subtask, or the task already has subtasks: one level only.                                        |
| `NOT_SAME_PROJECT` | 422    | A parent or blocker from another project.                                                                         |
| `TASK_MIRRORED`    | 409    | The field comes from Backlog.md. `field` names it: `labels`, `dueDate`, `blockedBy`, `parent`, and the M3 fields. |

### List filters and sort

`GET /tasks` takes these parameters besides `project`, `status`, `priority`, `q`, `limit` and `cursor`:

| Parameter   | Values                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------- |
| `assignee`  | `me`, `agents`, `none` or user ids; repeat for any of several (0.7.0).                      |
| `milestone` | Milestone ids or `none`; repeat for any of several (0.7.0).                                 |
| `cycle`     | A number, `current`, `next` or `none`; repeat for any of several (0.7.0).                   |
| `label`     | Label ids; a task matches when it has any of them.                                          |
| `due`       | `overdue` (open, due before today), `soon` (open, due today or in 2 days), `set`, `none`.   |
| `blocked`   | `true` for tasks with an open blocker, `false` for the others.                              |
| `topLevel`  | `true` leaves subtasks out.                                                                 |
| `parent`    | A task key: only its subtasks.                                                              |
| `sort`      | `priority`, `due` (soonest first, none last), `updated`, `created`, `manual` (board order). |
| `hidden`    | `only` for tasks removed from Backlog.md, `include` for every task.                         |

Without `sort`, `order=list` (the default) groups by status, then priority, then last update, and
`order=board` by status, then board rank. "Today" is the server's day in `APP_TIME_ZONE`.

### Bulk changes

`POST /tasks/bulk` changes up to 100 tasks of native projects in one transaction, with one history line per
task that changed. Send the keys and one change:

```json
{ "keys": ["PAY-140", "PAY-141"], "status": "in_review", "addLabels": ["release"] }
```

It takes `status`, `priority`, `assignee`, `milestone`, `cycle`, `dueDate`, `addLabels` and `removeLabels`
(null clears assignee, milestone, cycle and due date). It returns `{ items }`, the tasks in the order you
sent them. A mirrored task fails the whole request with `409 TASK_MIRRORED`. Milestone and cycle need every
task in one project (`422 NOT_SAME_PROJECT`).

## Labels

| Method and path                          | What it does                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /projects/{project}/labels`         | The project's labels by name, each with `usageCount`.                             |
| `POST /projects/{project}/labels`        | Create one: `{ name, color? }`. Without `color` the app picks the least used one. |
| `PATCH /projects/{project}/labels/{id}`  | Rename or recolour: `{ name?, color? }`.                                          |
| `DELETE /projects/{project}/labels/{id}` | Delete it and take it off every task (`204`).                                     |

Names are unique in the project, ignoring case (`409 LABEL_EXISTS`), and up to 40 characters. Renames and
deletes write no history: a task's history keeps the name it recorded. Labels read from Backlog.md files
(`source: "backlog"`) keep their name: renaming or deleting one fails with `409 LABEL_MIRRORED`, and their
colour still changes.

## Home

| Method and path    | What it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `GET /home`        | Home: groups of tasks, the deadlines strip and the agent cards.  |
| `GET /home/counts` | The sidebar count: review, mentions, blocked, overdue and total. |

`GET /home` takes `tab` (`mine`, the default, `everyone` or `agents`) and the filters `project` (keys),
`label` (names, merged across projects) and `priority`. It returns:
- `counts`: the number of items on each tab;
- `groups`, in order. Mine has `review`, `mentions`, `blocked`, `overdue` and `assigned`; Everyone has
  `review`, `blocked`, `overdue` and `dueThisWeek`; Agents has `waiting`. Each group has `total` and up to 50
  `items`: `{ task, reason, relation, pills }`. A task shows once, in its first group;
- `deadlines`: milestones and cycles that end within 2 days, and tasks due within 2 days or overdue (empty on
  Agents);
- `agents`: on the Agents tab, one card per agent: working or idle, its current task, its counts for today
  and its last five actions.

`GET /dashboard` and `GET /dashboard/counts` stay for `zamu dashboard` and scripts written for 0.6.0. The web
app no longer uses them.
