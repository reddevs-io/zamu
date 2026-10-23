# Self-hosting

project-management runs as one Docker image with three roles, started by `docker-compose.yml`:

| Service   | What it does                                                                |
| --------- | --------------------------------------------------------------------------- |
| `db`      | Postgres 18. The only service that keeps state, in the `pgdata` volume.     |
| `migrate` | Applies database migrations, then exits. Runs on every `docker compose up`. |
| `web`     | The web app, the REST API (`/api/v1`) and sign-in. Listens on port 3000.    |
| `worker`  | Background jobs (pg-boss), such as expiring old invitations once a day.     |

`web` and `worker` start only after `migrate` has finished without errors.

## Requirements

- Docker Engine with the Compose plugin (`docker compose version` prints v2 or later).
- Git, to get the source. There is no published image yet: compose builds it from the checkout.
- About 1.5 GB of disk for the image and its build cache, plus room for your data.
- A free TCP port for the web app (3000 unless you change `PORT`).

## Configure

```sh
git clone https://gitlab.com/reddevsdotio/tooling/project-management.git
cd project-management
cp .env.example .env
```

Edit `.env`:

| Variable             | Required | Default                    | Meaning                                                                                                |
| -------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET` | yes      | none                       | Signs sessions. 32 characters or more: `openssl rand -base64 32`. Compose refuses to start without it. |
| `BETTER_AUTH_URL`    | no       | `http://localhost:3000`    | The URL people type in their browser. Sign-in fails when it does not match.                            |
| `PUBLIC_URL`         | no       | `http://localhost:3000`    | Base URL for invitation links. Use the same value as `BETTER_AUTH_URL`.                                |
| `PORT`               | no       | `3000`                     | Host port the web app is published on.                                                                 |
| `POSTGRES_USER`      | no       | `postgres`                 | Database user.                                                                                         |
| `POSTGRES_PASSWORD`  | no       | `postgres`                 | Database password. Set it before the first start: Postgres only reads it when it creates the volume.   |
| `POSTGRES_DB`        | no       | `project_management`       | Database name.                                                                                         |
| `PM_IMAGE`           | no       | `project-management:local` | Tag of the image compose builds and runs.                                                              |

`DATABASE_URL` and `TEST_DATABASE_URL` in `.env` are for local development. Compose ignores them: the
containers reach Postgres as `db` on their own network.

If you change `PORT`, change the port in `BETTER_AUTH_URL` and `PUBLIC_URL` too.

## Start

```sh
docker compose up -d --build
docker compose ps
curl http://localhost:3000/api/healthz
```

The first build takes a few minutes. `/api/healthz` answers `{"status":"ok"}` once the web app can reach
Postgres. `docker compose ps` lists `migrate` as exited (code 0); that is expected.

Logs: `docker compose logs -f web worker`.

## First run

Open `BETTER_AUTH_URL` in a browser. A new server sends you to the setup page:
1. Create the admin account: your name, email and a password of 12 characters or more, or "Continue with
   {name}" when [single sign-on](#single-sign-on-oidc) is configured.
2. Name the workspace, usually your team or company.

You land on the projects page, signed in. Setup runs once; afterwards `/setup` sends visitors to sign in.

Nobody can sign up on their own. To add people, go to Settings > Members > Invite person, pick a role and copy
the invitation link. No email is sent: share the link yourself. It works once and expires after a week.

To add an AI agent, see [agents.md](agents.md).

## Single sign-on (OIDC)

People can sign in with one OpenID Connect provider (Authentik, Keycloak, Zitadel, Entra ID, ...). Without
these variables the server uses email and password only.
1. In the provider, create a confidential OAuth2/OpenID client with the authorization code flow and register
   this redirect (callback) URL:

   ```text
   {BETTER_AUTH_URL}/api/auth/oauth2/callback/oidc
   ```

   For example `https://projects.example.com/api/auth/oauth2/callback/oidc`. The provider must send `email`
   and `email_verified`; the `openid email profile` scopes do that for most providers.
2. Set the variables in `.env` and run `docker compose up -d`:

| Variable             | Default                | Meaning                                                             |
| -------------------- | ---------------------- | ------------------------------------------------------------------- |
| `OIDC_ISSUER`        | none                   | Issuer URL. Discovery: `{issuer}/.well-known/openid-configuration`. |
| `OIDC_CLIENT_ID`     | none                   | Client ID from the provider.                                        |
| `OIDC_CLIENT_SECRET` | none                   | Client secret from the provider.                                    |
| `OIDC_PROVIDER_NAME` | `SSO`                  | Button label: "Continue with {name}".                               |
| `OIDC_SCOPES`        | `openid email profile` | Space-separated scopes. `openid` is always requested.               |
| `OIDC_SIGNUP`        | `invite`               | Who gets an account on first SSO sign-in: see below.                |
| `OIDC_ADMIN_GROUPS`  | none                   | Comma-separated groups whose members are workspace admins.          |
| `OIDC_GROUPS_CLAIM`  | `groups`               | Claim with the user's groups. Authentik sends `groups`.             |
| `OIDC_TRUST_EMAIL`   | `false`                | `true`: treat the provider's email as verified. See below.          |
| `PASSWORD_LOGIN`     | `enabled`              | `disabled`: SSO only. Needs the three `OIDC_*` credentials.         |

SSO is on when `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are all set.
- `OIDC_SIGNUP=invite`: SSO signs in existing accounts (matched by verified email) and accepts pending
  invitations. Nobody else gets in.
- `OIDC_SIGNUP=auto`: anyone the provider signs in gets a member account in the workspace on first sign-in.
  Limit who that is in the provider (for example, bind the application to a group).
- `OIDC_ADMIN_GROUPS`: members of any listed group are admins, everyone else is a member. The role is
  re-applied at every SSO sign-in, so removing someone from the group demotes them at their next sign-in.
  Owners keep their role. If the provider stops sending the groups claim, everyone but the owner becomes a
  member.
- `OIDC_TRUST_EMAIL=true`: the provider's email counts as verified even when its `email_verified` claim is
  `false` or missing. Use it for providers that never mark emails as verified, such as Authentik with its
  default mappings. The trade-off: SSO matches people by email (to sign in, to link an existing account, to
  accept an invitation). If people can change their own email at the provider, someone you let in could set
  another person's address and sign in as them. Turn it on only when emails at the provider are managed by
  admins, or when everyone the provider admits is trusted.
- `PASSWORD_LOGIN=disabled` removes the password form from sign-in, setup and invitations, and the server
  refuses password sign-in. API keys (agents, the CLI) keep working.

What SSO does:
- **Sign-in** shows "Continue with {name}" above the password form, or alone with `PASSWORD_LOGIN=disabled`.
  Errors from the provider (consent denied, no account in `invite` mode) come back to the sign-in page as a
  banner.
- **First run**: the setup page offers SSO for the admin account. The first person to finish it becomes the
  admin and then names the workspace. Once anyone exists, setup through SSO is refused.
- **Invitations**: the invitation page offers SSO. The provider's verified email must be the invited address;
  otherwise the page explains the mismatch and nothing is created.
- **Existing accounts** link to the SSO identity with the same verified email, so people invited before SSO
  keep their account. Unverified emails are refused, unless `OIDC_TRUST_EMAIL=true`. Agents are never linked to an SSO identity; they keep
  using API keys.
- **Signing out** ends the session here only, not at the provider.

The server checks the configuration when it starts and exits with a message listing every problem, for
example `PASSWORD_LOGIN=disabled` without SSO, only some of the three `OIDC_*` credentials, a malformed
`OIDC_ISSUER`, an `OIDC_TRUST_EMAIL` other than `true` or `false`, an invalid `TRUSTED_IP_HEADERS`, or a
`BETTER_AUTH_SECRET` shorter than 32 characters: `docker compose logs web` shows it.

### Authentik

1. Applications > Providers > Create > OAuth2/OpenID Provider. Client type confidential, redirect URI as
   above (strict), signing key set (so ID tokens are signed with RS256), scopes `openid`, `email`, `profile`.
2. Applications > Create, with this provider. Bind the groups or users that may sign in.
3. `.env`:

   ```sh
   OIDC_ISSUER=https://auth.example.com/application/o/<application-slug>/
   OIDC_CLIENT_ID=<client id>
   OIDC_CLIENT_SECRET=<client secret>
   OIDC_PROVIDER_NAME=Authentik
   # Optional:
   OIDC_SIGNUP=auto
   OIDC_ADMIN_GROUPS=<admin group>
   PASSWORD_LOGIN=disabled
   ```

Authentik's default `email` scope mapping always sends `email_verified: false`, so every sign-in is refused
until you pick one of these:
- Set `OIDC_TRUST_EMAIL=true` (read the trade-off above first).
- Or send a verified claim yourself: Customization > Property Mappings > Create > Scope Mapping, with a scope
  name such as `pm-email` and the expression
  `return {"email": request.user.email, "email_verified": True}`. Add it to the provider's scopes, and request
  it instead of `email`: `OIDC_SCOPES=openid profile pm-email`. Only do this if users cannot change their
  own email in Authentik, for the same reason.

## Ports

| Port | Service | Published                                                                |
| ---- | ------- | ------------------------------------------------------------------------ |
| 3000 | `web`   | Yes, on the host port in `PORT`.                                         |
| 5432 | `db`    | No. Only `migrate`, `web` and `worker` reach it, on the compose network. |

The worker listens on no port. Because Postgres is not published, this stack can run next to another Postgres
on the same machine.

For HTTPS, put a reverse proxy (Caddy, nginx, Traefik) in front of port 3000 and set `BETTER_AUTH_URL` and
`PUBLIC_URL` to the public `https://` URL. Then `docker compose up -d` to apply the change.

### Client IP behind a proxy

Sign-in rate limits and the session list use the client's IP address. By default it comes from
`X-Forwarded-For`, and only when that header holds a single address. Behind several proxies (a CDN, then an
ingress) the header holds a chain, the server cannot tell who the client is, and the log says rate limiting
"could not determine a client IP". Then all clients share one rate-limit bucket per path.

`TRUSTED_IP_HEADERS` lists the headers to read instead, comma-separated, checked in order. Behind Cloudflare:

```sh
TRUSTED_IP_HEADERS=cf-connecting-ip,x-forwarded-for
```

Only list headers that your proxy sets or overwrites on every request. A client can send any header it likes,
so a header that reaches the app straight from the client lets anyone pick their own IP and get around the
rate limit. For example, list `cf-connecting-ip` only when the app can be reached through Cloudflare alone.

## Backups

All state lives in Postgres. Dump it with `pg_dump` from the `db` container:

```sh
mkdir -p ~/pm-backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ~/pm-backups/pm-$(date +%F).dump
```

This works while the app runs. Keep the dumps outside the checkout (anything in it ends up in the image build
context) and copy them to another machine.

To restore, stop the app, recreate the database, load the dump and start again:

```sh
docker compose stop web worker
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < ~/pm-backups/pm-2026-10-22.dump
docker compose up -d
```

Recreate the database rather than restoring with `pg_restore --clean`: the job queue uses partitioned tables,
and `--clean` fails on them.

To restore on a new machine, configure `.env` as above, start only the database (`docker compose up -d db`),
run the two `docker compose exec` lines, then `docker compose up -d --build`.

## Upgrades

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ~/pm-backups/pm-before-upgrade.dump
git pull
docker compose up -d --build
```

Compose rebuilds the image, runs `migrate` against the existing database, then restarts `web` and `worker`.
If a migration fails, `web` and `worker` do not start: `docker compose logs migrate` shows why.

## The CLI in the image

The image ships the `pm` CLI. It is handy for checking a key from the server:

```sh
docker compose exec -e PM_KEY=pm_live_... web pm whoami
```

Agents normally run `pm` on their own machine. See [agents.md](agents.md).

## Stop or remove

```sh
docker compose down        # stops the stack, keeps the data volume
docker compose down -v     # also deletes the data volume: everything is gone
```
