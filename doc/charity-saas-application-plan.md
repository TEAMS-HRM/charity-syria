# Charity SaaS - Initial Application Plan

> Scope: the first usable application after infrastructure. Build a public landing
> page, organization signup and provisioning, an organization portal, and a
> platform control page. Payments and full charity operations come later.

## Technology and URLs

| Area                           | Choice                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Web application                | Next.js + TypeScript                                                                                       |
| API                            | Existing NestJS + Fastify service                                                                          |
| Database                       | Existing PostgreSQL RDS, one shared `public` schema plus one schema per organization                       |
| Authentication                 | Cognito, with users linked to application records by Cognito `sub`                                         |
| Production public site         | `https://charity-syria.com`                                                                                |
| Production organization portal | `https://<org-slug>.charity-syria.com`                                                                     |
| Platform control page          | `https://admin.charity-syria.com`                                                                          |
| Staging equivalents            | `staging.charity-syria.com`, `<org-slug>.staging.charity-syria.com`, and `admin.staging.charity-syria.com` |

The existing wildcard DNS, TLS certificate, and API tenant resolver already support
organization subdomains without creating DNS records for every organization.

## First user journeys

1. A visitor opens the global landing page and can read about the service or start signup.
2. The founder creates an account, verifies their email, and enters the organization name and desired URL slug.
3. The API validates and reserves the slug, creates the organization record, and starts provisioning.
4. A provisioning worker creates the tenant schema, applies tenant migrations, seeds organization settings, and grants the founder the owner role.
5. When provisioning succeeds, the founder is redirected to `https://<org-slug>.charity-syria.com` and can sign in to the organization portal.
6. A platform administrator opens `admin.charity-syria.com` to list organizations, inspect provisioning status, suspend/reactivate access, and retry failed provisioning.

## Database boundaries

### Shared `public` schema

The shared schema contains platform-level records only:

- `users`: application identity linked to Cognito `sub`.
- `organizations`: organization ID, display name, unique slug, schema name, status, and timestamps.
- `organization_memberships`: user-to-organization membership and role (`owner`, `admin`, `member`).
- `platform_admins`: users allowed to access the control page.
- `provisioning_jobs`: provisioning state, attempts, and sanitized error details.
- `tenant_schema_versions`: migration version for each organization schema.
- `platform_audit_log`: platform actions such as create, suspend, reactivate, and provisioning retry.

Do not put donations, donors, campaigns, beneficiaries, or other organization-owned
records in `public`.

### Per-organization schema

Each organization gets an immutable schema name derived from its internal organization
ID, for example `tenant_01abc...`; do not derive the database identifier directly from
a user-editable name. The public slug maps the request host to that organization and
schema.

The first tenant migration only needs:

- `organization_settings`
- `audit_log`

Domain tables can be added in later migrations when their features are built. Every
tenant migration must run for existing schemas and become the baseline for newly
provisioned schemas.

## Tenant resolution and isolation rules

- Resolve the host to an **active organization record** in `public.organizations`; a syntactically valid subdomain alone must never grant tenant access.
- Treat `www`, `api`, `admin`, `app`, `static`, and `assets` as reserved slugs.
- Validate slug uniqueness case-insensitively and never reuse a slug while an organization is suspended.
- After authentication, verify the user has an active membership in the resolved organization.
- Run tenant work in a transaction with `SET LOCAL search_path` and always use the server-resolved schema; never accept a schema name or organization ID from the client as tenancy authority.
- Platform-control queries use explicitly qualified `public.*` tables and never run through a tenant connection context.
- Add automated tests proving organization A cannot read or mutate organization B data, including crafted host headers and IDs.

## Delivery phases

### Phase 1 - Shared data and authentication

1. Add migrations for shared platform tables, constraints, reserved slugs, and statuses.
2. Integrate Cognito signup, email verification, login, logout, and token validation.
3. Add API authorization guards for authenticated users, organization membership, and platform administrators.
4. Replace direct host-to-schema mapping with a lookup of an active organization in `public.organizations`.

**Done when:** a verified user can sign in, and unknown or inactive subdomains return a safe not-found response.

### Phase 2 - Landing page and organization signup

1. Build the global landing page at the root domain with sign-up and sign-in actions.
2. Build the organization signup form: organization name, URL slug, owner name, and account credentials.
3. Add live slug validation plus authoritative validation in the API.
4. Create the organization as `provisioning`, enqueue the provisioning job, and show a waiting/status screen.

**Done when:** signup reserves one unique organization and exposes clear pending, failed, and ready states.

### Phase 3 - Reliable tenant provisioning

1. Add a worker or one-off ECS task that claims provisioning jobs idempotently.
2. Create the schema with a restricted database role, apply tenant migrations, seed settings, and create the owner membership.
3. Mark the organization `active` only after every provisioning step succeeds.
4. Record failures without secrets and support a safe retry that does not duplicate data.

**Done when:** a successful signup produces a working organization URL, and retrying the same job is harmless.

### Phase 4 - Organization portal

1. Build the portal shell at `<org-slug>.charity-syria.com`.
2. Show organization name, current user, role, and basic settings.
3. Add owner-only member invitation and role management.
4. Add organization audit history for membership and settings changes.

**Done when:** an owner can manage only their organization and a member cannot perform owner actions.

### Phase 5 - Platform control page

1. Build `admin.charity-syria.com` behind a separate platform-admin authorization check.
2. List and search organizations by name, slug, status, and creation date.
3. Show organization details, schema version, owner, member count, and provisioning history.
4. Add audited actions to retry provisioning, suspend, and reactivate an organization.

**Done when:** only platform admins can access the page and every control action is recorded.

### Phase 6 - Hardening and release

1. Add tenant-isolation integration tests and authorization tests to CI.
2. Add rate limiting and abuse protection to signup and authentication endpoints.
3. Add alarms for provisioning failures and unusual control-page actions.
4. Test backup/restore for both `public` and tenant schemas.
5. Run staging acceptance tests using at least two organizations before production release.

## Initial API surface

| Method and route                              | Purpose                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `POST /auth/signup`                           | Register the founder account through Cognito            |
| `POST /organizations`                         | Reserve an organization and start provisioning          |
| `GET /organizations/:id/provisioning`         | Return signup/provisioning status to the founder        |
| `GET /tenant/context`                         | Return the resolved organization and current membership |
| `GET/PATCH /tenant/settings`                  | Read or update organization settings                    |
| `GET/POST/PATCH /tenant/members`              | Manage organization membership and roles                |
| `GET /platform/organizations`                 | List organizations for platform admins                  |
| `GET /platform/organizations/:id`             | Inspect one organization and provisioning history       |
| `POST /platform/organizations/:id/retry`      | Retry failed provisioning                               |
| `POST /platform/organizations/:id/suspend`    | Suspend organization access                             |
| `POST /platform/organizations/:id/reactivate` | Reactivate organization access                          |

Use opaque IDs in URLs. The API must derive tenant authority from the validated host and
authenticated membership, not trust an organization ID supplied in a request body.

## Recommended first sprint

1. Create the shared-schema migration and migration runner.
2. Add organization lookup to tenant resolution and tests for unknown/reserved hosts.
3. Integrate Cognito authentication and authorization guards.
4. Implement `POST /organizations` plus an idempotent provisioning worker.
5. Build the landing/signup/status screens.

That sprint establishes the security and provisioning foundation. Build the organization
portal and platform control page on top of it rather than mocking tenancy in the UI.
