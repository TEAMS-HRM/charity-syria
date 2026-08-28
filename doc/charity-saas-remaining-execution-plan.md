# Charity SaaS - Remaining Execution Plan

> Scope: complete the gaps from the initial plan with the current architecture (NestJS API + React frontend), keeping Arabic-first admin approvals and a clean signup-to-approval flow.

## Current Baseline

- Shared multi-tenant schema and core platform tables are in place.
- Organization creation and provisioning queue flow exist.
- Platform admin listing and approve action exist.
- Frontend has Arabic-first admin UI with English support.

## Milestone A - Signup and Approval UX (Now)

1. Replace old landing experience with a production-style global landing UI.
2. Add "Sign up organization" dialog with required fields:

- Organization name
- Desired slug
- Owner name
- Owner email

3. Submit signup request to `POST /organizations` and show clear success/failure states.
4. Keep Arabic admin control page to list requests and approve.
5. Ensure approved organization URL opens and default page displays organization name.

Done when:

- A signup from landing appears in admin list as pending/provisioning.
- Approving from admin activates tenant URL.
- Opening `https://<slug>.charity-syria.com` shows a default organization page with org name.

## Milestone B - Missing Platform API Controls

1. Add `GET /platform/organizations/:id` details endpoint.
2. Add `POST /platform/organizations/:id/retry` for failed provisioning.
3. Add `POST /platform/organizations/:id/suspend`.
4. Add `POST /platform/organizations/:id/reactivate`.
5. Record all control actions in `public.platform_audit_log`.

Done when:

- All actions are guarded by platform-admin checks.
- Each action writes an audit event with actor and timestamp.

## Milestone C - Organization Portal Foundation

1. Add tenant portal shell at `<org-slug>.charity-syria.com`.
2. Add tenant settings API (`GET/PATCH /tenant/settings`) and basic UI.
3. Add tenant members API (`GET/POST/PATCH /tenant/members`) and owner/admin role rules.
4. Add tenant audit log API and basic activity view.

Done when:

- Owner can manage members/settings only in own org.
- Member access cannot perform owner-only actions.

## Milestone D - Auth Product Flow

1. Implement Cognito-backed signup/login/logout endpoints and callbacks.
2. Add email verification and session/token lifecycle UX.
3. Replace dev identity fallback in production paths.

Done when:

- Real founder can sign up, verify email, sign in, and create org without dev headers.

## Milestone E - Provisioning Reliability

1. Move provisioning execution from in-process polling to dedicated worker/queue.
2. Add safe retry policy and dead-letter handling.
3. Add idempotency checks to avoid duplicate side effects.
4. Add operational logs/metrics for queue depth and failures.

Done when:

- Retries are safe, observable, and recoverable without manual DB fixes.

## Milestone F - Hardening and Release

1. Add tenant-isolation integration tests and authorization tests in CI.
2. Add rate limiting/abuse protection for signup and auth endpoints.
3. Add CloudWatch alarms for provisioning failures and suspicious admin actions.
4. Execute backup/restore drills for public + tenant schemas.
5. Run staging acceptance with at least two org tenants before production.

Done when:

- CI and runbook evidence confirm security, recovery, and release readiness.

## Suggested Build Order

1. Milestone A (UX flow completion)
2. Milestone B (platform controls + audit)
3. Milestone C (tenant portal foundation)
4. Milestone D (full auth product flow)
5. Milestone E (reliable worker architecture)
6. Milestone F (hardening and go-live checks)
