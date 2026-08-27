# Charity SaaS — AWS Infrastructure & Deployment Plan

> Scope: **infra + CI/CD pipeline only** — no application features, no Stripe logic,
> no tenant provisioning. Goal is a green, reproducible, deployable skeleton across
> **staging + production**, built as Infrastructure-as-Code (Terraform).
>
> Estimated effort with AI agents alongside you: **~4–8 working days** (do it as IaC).

---

## Target stack (all AWS)

| Concern | Service |
|---|---|
| Compute (backend) | **ECS Fargate** (containers, no servers to patch) |
| Container registry | **ECR** |
| Database | **RDS / Aurora PostgreSQL** (schema-per-tenant) |
| Frontend | Next.js or Angular → **CloudFront + S3** (or Amplify Hosting) |
| Entry point / routing | **ALB** (Application Load Balancer) |
| DNS | **Route53** — wildcard `*.charity-syria.com` |
| TLS | **ACM wildcard cert** `*.charity-syria.com` (auto-renew) |
| Payments | **Stripe Connect** (external; webhooks hit Fargate) |
| Media | **S3 + CloudFront**; video via MediaConvert / Mux / Cloudinary |
| Secrets | **AWS Secrets Manager** |
| Auth | **Cognito** or custom JWT |
| CI/CD | **GitHub Actions → ECR → Fargate**, OIDC auth |
| Observability | **CloudWatch** + Sentry |
| Billing separation | **AWS Organizations** (separate member account) |

---

## Billing / account structure decision

- Enable **AWS Organizations** on the current (ScreenHRM) account → it becomes the
  **management / payer** account. Non-destructive; ScreenHRM keeps running unchanged.
- Create a **new member account for CharityApp** inside the org.
- **Consolidated billing**: one payment method at payer level, per-account cost breakdown.
- Member accounts **cannot** hold their own payment method while in the org.
  - Want cost *visibility* only → stay in org, use per-account breakdown + Budgets.
  - Need a genuinely *different card/entity* to pay → keep CharityApp **standalone**
    (outside the org) with its own payment method.
- Lock down the management account root: **MFA, no daily use, minimal access**.

---

## Setup order (never-blocked sequence)

### Phase 0 — Accounts & access (everything depends on this)
1. Enable AWS Organizations on current account → becomes management/payer.
2. Create CharityApp member account inside the org.
3. Lock down root on both: MFA, strong password, stop using root day-to-day.
4. Create IAM admin user/role for CharityApp + a CI/CD deploy role (least privilege).
5. Create **S3 bucket + DynamoDB table for Terraform remote state/locking**. Do this
   before writing infra — it's where state lives.

### Phase 1 — Networking foundation
6. VPC with public + private subnets across 2 AZs.
7. Internet Gateway (public) + NAT Gateway (private subnets reach out for image pulls, Stripe).
8. Security groups: ALB SG (public 443), Fargate SG (from ALB only), RDS SG (from Fargate only).

### Phase 2 — Registry & a deployable artifact
9. Create **ECR** repository.
10. Build & push a **hello-world container** (tiny HTTP responder) — need something
    deployable to prove the pipeline before real code exists.

### Phase 3 — Compute + entry point
11. **ALB** in public subnets + target group + health check path (`/health`).
12. **ECS Fargate** cluster + service + task definition running hello-world, in private
    subnets, registered to the ALB target group.
13. Hit the ALB DNS name over HTTP → hello-world. ← **Milestone 1: container live.**

### Phase 4 — Domain & TLS
14. **ACM wildcard cert** `*.charity-syria.com` (DNS-validated).
15. **Route53** wildcard record `*.charity-syria.com` → ALB (+ apex if needed).
16. ALB HTTPS listener (443) using ACM cert; redirect 80→443.
17. Hit `https://anything.charity-syria.com` → hello-world over TLS.
    ← **Milestone 2: TLS + wildcard multi-tenant routing proven.**

### Phase 5 — Database
18. **RDS / Aurora PostgreSQL** in private subnets, subnet group across 2 AZs.
19. Store DB credentials in **Secrets Manager**.
20. Confirm Fargate task connects to Postgres privately (usually needs SG fiddling).
    ← **Milestone 3: DB reachable.**

### Phase 6 — Secrets & config
21. Secrets Manager entries: DB URL, (later) Stripe keys — per environment.
22. Wire Fargate task execution role to read those secrets as env vars.

### Phase 7 — CI/CD (ties it together)
23. GitHub Actions: on merge → build image → push to ECR → update Fargate service.
24. Two environments: **staging** auto-deploys; **production** behind a **manual approval gate**.
    ← **Milestone 4: pipeline deploys.**
25. Smoke test after deploy (curl `/health` through the ALB).

### Phase 8 — Safety nets
26. CloudWatch log groups for Fargate + alarms (5xx rate, unhealthy tasks).
27. **AWS Budgets** on the account + alert threshold.
28. Automated RDS backups on + test a restore once.

**Milestone checkpoints:** 13 (container live), 17 (TLS + routing), 20 (DB reachable),
24 (pipeline deploys). Hit those four and the skeleton is done.

---

## Do it twice cleanly

Build **staging** end-to-end first (steps 1–28), then reproduce **production** by reusing
the same Terraform with different variables. The second environment should be a **variable
change, not a rebuild** — that's the whole point of doing it as code.

---

## Terraform module structure

```
infra/
├── terraform/
│   ├── modules/                    # reusable building blocks
│   │   ├── networking/             # VPC, subnets, IGW, NAT, route tables
│   │   ├── security/               # security groups, IAM roles/policies
│   │   ├── ecr/                    # container registry
│   │   ├── alb/                    # load balancer, listeners, target groups
│   │   ├── ecs/                    # cluster, service, task definition
│   │   ├── rds/                    # Postgres, subnet group, param group
│   │   ├── acm/                    # ACM cert + DNS validation records
│   │   ├── dns/                    # Route53 alias records (domain + wildcard)
│   │   ├── secrets/                # Secrets Manager entries
│   │   └── observability/          # CloudWatch log groups, alarms, budgets
│   │
│   ├── environments/
│   │   ├── staging/
│   │   │   ├── main.tf             # calls modules with staging vars
│   │   │   ├── variables.tf
│   │   │   ├── terraform.tfvars    # staging-specific values
│   │   │   └── backend.tf          # remote state (staging key)
│   │   └── production/
│   │       ├── main.tf             # same modules, prod vars
│   │       ├── variables.tf
│   │       ├── terraform.tfvars    # prod-specific values
│   │       └── backend.tf          # remote state (prod key)
│   │
│   └── global/
│       ├── bootstrap/              # S3 state bucket + DynamoDB lock table
│       │                           # (apply this FIRST, before everything)
│       └── dns/                    # public hosted zone for the root domain
│                                   # (shared by staging + prod; apply before Phase 4)
```

### How the pieces relate
- **`global/bootstrap`** runs once, manually, first — creates the S3 bucket + DynamoDB
  table all other state uses. Chicken-and-egg: this one uses local state, everything
  after uses remote.
- **`global/dns`** runs once too — the hosted zone is shared by both environments, so it
  can't live in either one's state. Environments look it up by name with a data source.
- **`acm` before `alb` before `dns`**: the ALB listener takes the certificate ARN as an
  input, and the alias records take the ALB's DNS name as an input. Two modules instead
  of one keeps that chain one-directional.
- **`modules/`** are parameterized and environment-agnostic (no hardcoded names). Each
  takes inputs (CIDR, sizes, domain) and exposes outputs (VPC ID, subnet IDs, ALB ARN)
  that downstream modules consume.
- **`environments/staging` & `production`** are thin — they call the same modules with
  different `.tfvars`. e.g. staging `db_instance_class = "db.t4g.micro"`, prod
  `"db.t4g.medium"`. Same module, different size.

### Dependency order within an environment's `main.tf`
```
networking → security → ecr → acm → alb → ecs → rds → dns → secrets → observability
```
Terraform resolves most ordering via references; structure module calls in this order
for readability.

### Wiring notes
- Pass outputs between modules explicitly (`networking` outputs subnet IDs →
  `ecs`/`rds` consume them). Keep data flow visible; don't let modules look each other up.
- Keep **GitHub Actions** config outside Terraform (`.github/workflows/`), but let it read
  Terraform outputs (ECR URL, cluster name, service name) so deploys target the right resources.
- Use a **GitHub → AWS OIDC role**, not long-lived access keys. Current best practice;
  avoids storing secrets.

---

## Suggested first three moves
1. Apply `global/bootstrap` → remote state exists.
2. Build `modules/networking` + `modules/security`, apply to staging → foundation up.
3. Get `ecr` + `ecs` + `alb` deploying hello-world to staging → **Milestone 1 (step 13)**.

From there the rest slots in in the order above.

---

## Time estimate breakdown

| Task | Est. |
|---|---|
| AWS Organizations + new account, IAM/roles, MFA lockdown | 0.5–1 day |
| Networking: VPC, subnets, ALB, security groups | 0.5–1 day |
| ECS Fargate + ECR, deploy hello-world | 1–1.5 days |
| RDS/Aurora Postgres provisioning + connectivity | 0.5–1 day |
| Route53 wildcard + ACM wildcard cert wired to ALB | 0.5 day |
| CI/CD (GitHub Actions → ECR → Fargate), staging + prod, gated approval | 1–2 days |
| Secrets Manager, env config, CloudWatch, Budgets | 0.5–1 day |

**Time sinks to expect:** first Fargate + ALB + networking wiring (target groups, health
checks, SGs); RDS private connectivity from Fargate; IAM least-privilege roles; first green
production deploy through the approval gate.

---

## Not in this scope (next phase — the app itself)
- Tenant provisioning flow (create schema, seed admin)
- Stripe Connect onboarding + webhooks + reconciliation
- Domain models: donors, donations, campaigns, media
- Generic/global portal + per-org portals
- Auth wiring, roles/permissions
- Tenant-isolation testing (org A can never see org B)

Once real features + Stripe + tenant provisioning land, you're back into the
**multi-week app estimate** (~5–9 weeks MVP).
