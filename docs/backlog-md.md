# Backlog.md

[Backlog.md](https://github.com/MrLesk/Backlog.md) keeps a project's tasks as Markdown files in the
repository, usually in a `backlog/` folder. A project here can read those files in one of two ways:
- **Mirror.** The project follows the repository's default branch. Agents keep editing the files with the
  `backlog` CLI, and every push shows up here. Fields that come from the files are read-only in this app;
  comments, cycles and the order of cards inside a board column stay editable.
- **Import once.** The project reads the files one time and then detaches. Every task is editable here
  afterwards, and later changes to the files no longer reach the project. Use it to move a team off
  Backlog.md.

Nothing is written back to the repository. There is no two-way sync: Backlog.md hands out task numbers
without any reservation and each branch can hold different tasks, so the files stay the one place where
mirrored fields change.

The server reads the files through the git host's API with an access token. It never clones the
repository.

## Before you start

You need:
- `APP_ENCRYPTION_KEY` set on the server (web and worker). Without it, the Git connections page and the
  setup ask for it. See [self-hosting.md](self-hosting.md#git-connections-and-backlogmd).
- A git connection for the host: Settings > Git connections > Add connection. See below.
- The owner or admin role. Members can see a mirror's status but cannot set one up, change its mappings or
  detach it.
- A project with no tasks, linked to the repository. "New project from Backlog.md" creates one for you.

## Git connections

A connection is a workspace-wide access token for one git host. Owners and admins manage them in Settings >
Git connections; everyone can see the list, and nobody sees the tokens.
1. Pick the provider yourself (GitHub, GitLab, or Gitea / Forgejo). A self-hosted address does not say which
   software runs there.
2. Enter the host: `github.com`, `gitlab.com`, or your server's address with its port if it has one
   (`git.example.com:3000`). For GitHub Enterprise, enter its host; the server calls its `/api/v3` API.
3. Name the connection and paste the token. Test checks the token before you save, and Save tests it again:
   a token the host rejects is never stored. The token is encrypted with `APP_ENCRYPTION_KEY` and never
   shown again; the list shows only its last three characters.

Read-only tokens are enough:

| Provider        | Token                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| GitHub          | Fine-grained token with read-only `Contents` access to the repositories (`Metadata` comes with it). |
| GitLab          | Personal, group or project access token with the `read_api` scope and at least the Reporter role.   |
| Gitea / Forgejo | Access token with the `read:repository` and `read:user` scopes.                                     |

With GitLab, `read_user` plus `read_repository` also works. On GitHub, a classic token needs the `repo`
scope for private repositories, which also grants write access, so prefer a fine-grained token.

A project picks its connection by host: the repository `https://gitlab.example.com/team/app` uses the
connection whose host is `gitlab.example.com`. When the host rejects a token or cannot be reached, every
mirror that uses the connection pauses until a later check works. Editing the connection with a new token,
or pressing Test, resumes them. Deleting a connection pauses its mirrors; pick another one in the project's
Settings > Backlog.md > Use another connection.

## Set up a mirror or an import

There are two ways in:
- **New project from Backlog.md** on the Projects page. Paste the clone URL. The dialog finds the connection
  by host, reads the folder and fills the name from `project_name` in `config.yml` and the key from the task
  prefix (`task_prefix: "pay"` gives `PAY`). Pick Mirror or Import once. It creates the project and opens the
  setup at the mappings step.
- **Settings > Backlog.md** on an existing project with no tasks and a linked repository: Set up a mirror,
  or Import.

The setup has five steps, and nothing is written before the last one:
1. **Mode.** Mirror or Import once.
2. **Source.** The connection, the repository, its default branch and the folder. The server looks for the
   folder in this order: the folder you typed, `backlog_directory` in a root `backlog.config.yml`, then
   `backlog/`, then `.backlog/`.
3. **Mappings.** How Backlog.md statuses, priorities and assignees become values here (see below).
4. **Preview.** A dry run on the current head commit: how many tasks, drafts, archived tasks, subtasks and
   milestones the read creates, the first keys, the files it would skip and the values that fall back.
5. **Read.** Start mirroring (or Import N tasks). The first read runs in the worker. Tasks appear all at
   once when it finishes; nothing shows half-done.

Starting a mirror turns milestones on for the project. An import detaches right after its first read, in
the same job.

## Mappings

Each Backlog.md value maps to one value here. The setup fills them in by name, and you can change any row.
- **Statuses** match by name, ignoring case, spaces, dashes and underscores (`To Do` is Todo). Names that
  contain `review` map to In review, `progress` or `doing` to In progress, `done` or `complete` to Done,
  `cancel` or `won't` to Canceled, `backlog` or `icebox` to Backlog. Drafts always come in as Backlog.
- **Priorities**: `high`, `medium` and `low` map to High, Medium and Low. A task without a priority gets
  none.
- **Assignees** match `@name` or `name` against member names, agent names and the part of an email before
  the `@`. A task gets the first of its assignees that maps to a member; the others stay listed in its
  Backlog.md section.

A value with no mapping, including one that appears in a later push, gets the fallback (Todo, no priority,
no assignee) and a warning. To change the mappings later, open Settings > Backlog.md > Edit mappings. The
next refresh applies them to every task.

## What a mirror owns

| Object    | Comes from Backlog.md                                                       | Editable here                                  |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Task      | Title, description, status, priority, assignee, milestone, creation date    | Cycle, order inside its board column, comments |
| Milestone | Name, description, target date, status, and creating or deleting milestones | Nothing                                        |
| Project   | Key (it has tasks), repository, and turning milestones off                  | Name, description, cycles switch               |

In the web app, fields that come from the files have a hatch, and a click explains where to change them. The
board does not let a mirrored card move to another column. New is disabled and says that tasks are created
in Backlog.md. The API and `pm` refuse the same changes with `409` and the codes `TASK_MIRRORED`,
`MILESTONE_MIRRORED` or `PROJECT_MIRRORED`, naming the field, the file and a `backlog` command that makes the
change.

The description is the task's Description section followed by its other sections under `##` headings:
Acceptance criteria, Definition of done, Implementation plan, Implementation notes, Comments from Backlog.md
and Final summary. Checklists keep their `- [ ]` and `- [x]` items.

Everything else in the file (labels, extra assignees, dependencies, parent task, subtasks, due date, type,
references, documentation, modified files, reporter, last update, unknown keys) is shown read-only in the
task's Backlog.md section. Dependencies, the parent and subtasks link to their tasks here.

## Keys and subtasks

A mirrored task keeps its Backlog.md number. In a project with the key `PAY`:

| Backlog.md   | Key here                                                      |
| ------------ | ------------------------------------------------------------- |
| `BACK-786`   | `PAY-786`                                                     |
| `BACK-786.1` | `PAY-786.1`                                                   |
| `back-007`   | `PAY-7`                                                       |
| `DRAFT-14`   | the next number above the highest task, for example `PAY-787` |

Zero padding is dropped. Drafts have their own numbering in Backlog.md, so they get numbers above the
highest task number on the first read and keep them afterwards.

The Backlog.md ID works wherever a task key does, in URLs, the API and `pm`, ignoring case:
`pm tasks show BACK-786.1`. IDs such as `TASK-12` can repeat across projects; pass `--project` (or the API's
`project` parameter) when an ID alone is ambiguous.

## Refreshes

A refresh reads the default branch at its head commit, downloads only the files whose content changed, and
applies every change in one database transaction. A refresh starts when:
- the git host sends a push webhook for the default branch (see below);
- someone presses Refresh now in the project header's Backlog.md popover or in Settings > Backlog.md (⇧R);
- an agent runs `pm backlog refresh`;
- the hourly check runs, at 15 minutes past each hour (UTC). It stops early when the head has not moved.

Webhook pushes within a minute of each other collapse into one refresh, so a burst of pushes costs one read.
Refresh now and `pm backlog refresh` start right away. Open pages pick up a finished refresh the next time
they load their data; reload the page to see it at once.

The source has one of these states, shown in the project header:

| State                    | Meaning                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Mirroring                | Every file was read and every value mapped.                                                     |
| Mirroring, with problems | Some files were skipped or read with a warning, or some values fell back.                       |
| Last refresh failed      | `config.yml` did not parse, or the read failed. Nothing was written; the last good state stays. |
| Paused                   | The connection is missing, rejected or unreachable, or `APP_ENCRYPTION_KEY` is missing.         |
| Detached                 | The project no longer reads the files.                                                          |

Settings > Backlog.md lists the problems of the last refresh, file by file. A task file that does not parse
is skipped and its task keeps its last good version (a new task appears once its file parses). When two files
carry the same ID, the one with the later `updated_date` wins and the other is listed as a problem.

A file matches its task by Backlog.md ID, not by path. Renaming a task, which renames its file, updates the
same task.

## Hidden tasks

When a task's file disappears from the default branch, the task is hidden, not deleted. It drops out of the
list, the board, My tasks and every count, and keeps its comments, cycle and board position. Opening it by
URL shows "Removed from Backlog.md" with the commit where it was last seen.

To list hidden tasks, use the "Removed from Backlog.md" filter on the task list (`/p/PAY?hidden=only`), or
`GET /api/v1/tasks?project=PAY&hidden=only`. When a file with the same ID comes back, the task comes back with the same
key.

Archived tasks (`archive/tasks/`, and the old `completed/` folder) are not hidden: they come in with their
own status, usually Done.

## Webhooks

Without a webhook the mirror checks once an hour. With one, a push shows up within seconds. Owners and admins
open Settings > Backlog.md and press Setup next to Webhook (or Set up the webhook at the end of the setup).
The dialog shows the URL and the secret, with the steps for your provider. Its last line turns green when the
first notification arrives.

The git host must reach the URL, which is built from `PUBLIC_URL`:

```text
https://projects.example.com/api/webhooks/backlog/<id>
```

**GitLab.** Open the repository > Settings > Webhooks > Add new webhook. Paste the URL, and the secret into
Secret token. Under Trigger, tick Push events only, for the default branch. Save, then press Test > Push
events.

**GitHub.** Open the repository > Settings > Webhooks > Add webhook. Paste the URL into Payload URL, pick
`application/json` as the content type, and paste the secret into Secret. Keep "Just the push event". GitHub
sends a ping on save.

**Gitea / Forgejo.** Open the repository > Settings > Webhooks > Add webhook > Forgejo (or Gitea). Paste the
URL into Target URL, keep POST and `application/json`, and paste the secret into Secret. Under Trigger on,
pick Push events and set the branch filter to the default branch. Save, then open the webhook and press Test
delivery.

The server checks GitHub's `X-Hub-Signature-256`, GitLab's `X-Gitlab-Token`, and Gitea's or Forgejo's
signature header against the secret. A request with a wrong signature or an unknown ID gets `404`. Pushes to
other branches get `204` and change nothing. After detach the URL answers `410 Gone`; remove the webhook at
the host then.

## Detach

Detach ends a mirror and cannot be undone. Owners and admins find it in Settings > Backlog.md and confirm by typing the project key. Afterwards:
- every field of every task and milestone is editable here, by people and agents;
- changes to the files no longer reach the project, and the webhook URL answers `410 Gone`;
- new tasks continue the numbering (after `PAY-812` comes `PAY-813`);
- each task keeps its Backlog.md ID and section as a read-only record, and its ID still finds it;
- hidden tasks stay hidden.

An import is a mirror that detaches right after its first read.

## Agents in a mirrored project

Agents keep working in the files with the `backlog` CLI and push as usual. `pm` reads the tasks, comments
on them and sets cycles. See [agents.md](agents.md#backlogmd-mirrors).
