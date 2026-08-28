# CharityApp API

NestJS on Fastify, running on ECS Fargate. Multi-tenant by subdomain, one
PostgreSQL schema per tenant.

Deployed by [`.github/workflows/deploy-staging.yml`](../../.github/workflows/deploy-staging.yml)
on every merge to `main` that touches `app/api/**`. There is no manual deploy
step and no local Docker requirement.

---

## Endpoints

| Route                                        | Purpose                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /`                                      | Echoes resolved tenant and organization context; unknown/inactive org subdomains return 404 |
| `GET /landing`                               | Temporary global landing + org-signup web page for milestone testing                        |
| `GET /admin`                                 | Temporary platform control page; guarded by auth + platform admin                           |
| `GET /organizations/slug/:slug/availability` | Slug availability check                                                                     |
| `POST /organizations`                        | Reserve organization, bootstrap founder owner membership, enqueue provisioning job          |
| `GET /organizations/:id/provisioning`        | Provisioning status check                                                                   |
| `POST /organizations/provisioning/run-once`  | Run one provisioning job (optionally for one organization id)                               |
| `POST /platform/bootstrap-admin`             | Dev/local bootstrap for first platform admin user (disabled when Cognito is enabled)        |
| `GET /platform/organizations`                | List organizations with status and provisioning summary                                     |
| `POST /platform/organizations/:id/approve`   | Approve signup by running provisioning for the selected organization                        |
| `GET /tenant/context`                        | Authenticated tenant context (requires active org membership)                               |
| `GET /health`                                | ALB target-group probe. **Shallow on purpose**                                              |
| `GET /health/db`                             | Deep check: real query against Postgres, pool stats                                         |

### Why `/health` does not touch the database

The ALB deregisters a task that stops returning 200, and ECS replaces it. If the
health check queried Postgres, a brief database blip would fail every task at
once, ECS would kill them all, and a recoverable database hiccup would become a
total outage — with new tasks also failing to start. Shallow liveness, separate
deep check. `/health/db` always returns 200 even when the database is down: it is
a diagnosis to read, not a trigger for the load balancer to act on.

---

## Configuration

All from the environment; the task definition supplies them (see
[`infra/terraform/environments/staging/main.tf`](../../infra/terraform/environments/staging/main.tf)).

| Variable                                                        | Notes                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `PORT`                                                          | default 8080                                                       |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER`                         | plain env, not secret                                              |
| `DB_PASSWORD`                                                   | injected by ECS from Secrets Manager, never in the task definition |
| `DB_SSL`                                                        | `true` in AWS — RDS enforces `rds.force_ssl`                       |
| `ROOT_DOMAIN`                                                   | everything to its left in a `Host` header is the tenant            |
| `PROVISIONING_WORKER_ENABLED`                                   | set `true` to process provisioning queue automatically             |
| `PROVISIONING_WORKER_INTERVAL_MS`                               | worker polling interval in milliseconds (default `4000`)           |
| `COGNITO_REGION` `COGNITO_USER_POOL_ID` `COGNITO_APP_CLIENT_ID` | enables Cognito JWT verification for auth guards                   |
| `LOG_LEVEL`                                                     | pino level, default `info`                                         |

When Cognito variables are not configured, guarded endpoints accept local dev
identity using headers:

- `x-dev-user-sub: local-user-1`
- `x-dev-email: founder@charity.local` (optional)

For browser loading of guarded HTML pages, the same values can be passed as
query params:

- `/admin?devSub=local-user-1&devEmail=founder%40charity.local`

Missing required variables throw at startup rather than on the first request
that needs them, so a misconfigured task fails the deploy instead of serving
errors.

---

## Tenancy

`resolveTenant(host, rootDomain)` turns `acme.staging.charity-syria.com` into
slug `acme` and schema `tenant_acme`. The wildcard DNS record and wildcard
certificate from Phase 4 mean a new tenant needs no infrastructure change at all.

Anything that is not a single valid label below the root domain resolves to the
`public` schema, never to a tenant — that includes a foreign `Host` header, a
two-label subdomain, and the reserved names (`www`, `api`, `admin`, `app`,
`static`, `assets`).

`DatabaseService.withTenant(schema, work)` pins a pooled connection's
`search_path` for the duration of the callback and resets it in a `finally`.
That reset is the important half: a leaked `search_path` would hand the next
request on that connection the previous tenant's data. The schema name is also
pattern-checked before interpolation, since an identifier cannot be parameterised.

---

## Logging

Structured JSON via pino, one line per request, straight to the CloudWatch log
group `/ecs/charityapp-staging`.

```powershell
aws logs tail /ecs/charityapp-staging --follow --region ap-south-1
```

Each line carries method, path, host, status, duration, resolved tenant, and a
request id taken from the ALB's `X-Amzn-Trace-Id` where present — so a log line
can be traced back to the load balancer's own record of the request. Cookies and
`Authorization` headers are stripped before writing.

### Health checks are excluded, and the obvious way to do it does not work

Use nestjs-pino's module-level `exclude`, **not** pinoHttp's
`autoLogging.ignore`:

```ts
LoggerModule.forRoot({
  pinoHttp: {
    /* ... */
  },
  exclude: [{ path: "health", method: RequestMethod.GET }],
});
```

nestjs-pino runs as Nest middleware, and under Fastify the request object handed
to `autoLogging.ignore` has its url rewritten relative to the mount point — it is
always `"/"`, so a path comparison there silently never matches. The serializer
runs later against the real request, so the logs _look_ correct while the filter
does nothing at all. Confirmed by instrumenting `ignore()`: it received `"/"` for
a request to `/health`.

It matters because each ALB node probes every 30 seconds. Left in, health checks
drown out real traffic and you pay CloudWatch to store them.

---

## Local development

```powershell
npm install
npm run start:dev      # ts-node-dev, reloads on change
```

Needs a local PostgreSQL, since the app refuses to start without a working
connection:

```powershell
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="5432"
$env:DB_NAME="charityapp"; $env:DB_USER="postgres"; $env:DB_PASSWORD="..."
$env:DB_SSL="false"        # local Postgres normally has no TLS
$env:ROOT_DOMAIN="localhost"
```

`npm run build` compiles to `dist/`, `npm run typecheck` checks without emitting.
`dist/` is gitignored — the image builds it.

---

## Not done yet

- **Provisioning runner architecture.** A run-once endpoint and optional in-process
  worker exist, but production should use a dedicated worker task/queue with
  retries and dead-letter handling.
- **Tenant membership bootstrap.** Provisioning activates an organization and
  creates baseline tenant tables, but founder user/membership seeding is not wired.
- **Auth product flow.** JWT verification and guards exist, but full Cognito signup,
  verification, and sign-in UX/API flow is incomplete.
- **Control page authorization.** `/admin` and `/platform/organizations` are
  currently for testing and not yet protected by platform-admin guard.
- **TLS verification.** `rejectUnauthorized: false` — traffic is encrypted, but
  the server certificate is not verified. Bake the RDS CA bundle into the image
  before production.
- **Least-privilege database user.** The app connects as the RDS master user.
  It should connect as a role that can create schemas but not drop the database.
