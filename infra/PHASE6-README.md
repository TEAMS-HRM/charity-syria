# Phase 6 — Secrets & config

Adds `modules/secrets`: one Secrets Manager entry per environment holding the
application's own configuration, wired into the Fargate task alongside the
database credential from Phase 5.

Prereqs: Phase 5 applied (the `secrets` / `secret_arns` plumbing on `modules/ecs`
comes from there).

> **Staging status, 2026-08-27.** Applied. The secret exists, the execution role
> can read both it and the RDS credential, and the service runs task definition
> revision 3 with `DB_PASSWORD` and `SESSION_SECRET` injected.

---

## Half of this phase already existed

The plan splits Phase 6 into two steps:

| Step | State |
|---|---|
| 21. Secrets Manager entries per environment | **this phase** |
| 22. Wire the task execution role to read them as env vars | **done in Phase 5** |

Step 22 came along for free: injecting the RDS password needed exactly that
machinery, so `modules/ecs` already takes a `secrets` map and a `secret_arns`
list and builds the IAM grant from them. This phase adds a second secret to the
same wiring, which is the real test of it — the grant is now a two-element
resource list rather than a special case for one.

---

## What this phase creates

| Resource | Notes |
|---|---|
| `aws_secretsmanager_secret` (`charityapp-staging/app`) | one per environment; `recovery_window_in_days = 0` in staging |
| `aws_secretsmanager_secret_version` | placeholder values, written once |
| task definition revision | adds `SESSION_SECRET` from the new secret |
| execution role policy | updated in place; now grants read on both secret ARNs |

### Terraform owns the shape, not the values

```hcl
resource "aws_secretsmanager_secret_version" "app" {
  secret_string = jsonencode(var.initial_values)

  lifecycle {
    ignore_changes = [secret_string]
  }
}
```

Terraform creates the secret with its keys and placeholder values, then stops
tracking the contents. Without `ignore_changes`, every apply would overwrite a
real Stripe key with `REPLACE_ME`, and the real value would sit in state and in
plan output. With it, replacing a value out of band causes no drift:

```powershell
aws secretsmanager put-secret-value --secret-id charityapp-staging/app --region ap-south-1 `
  --secret-string '{"SESSION_SECRET":"<a real value>"}'

terraform plan     # still "no changes"
```

The trade-off is real and worth stating: `terraform plan` can no longer tell you
whether a value is still a placeholder. Adding a **key** is a Terraform change;
setting a **value** never is.

### Why the database URL is not in here

The plan doc lists "DB URL" as a Phase 6 secret. It isn't one, deliberately.
RDS owns the master credential and can rotate it; a second copy in this secret
would be stale the moment that happened. The task gets `DB_HOST`, `DB_PORT`,
`DB_NAME` and `DB_USER` as plain environment variables and `DB_PASSWORD` from
the RDS-managed secret, and assembles its own connection string at startup.

That is also why there are two secrets rather than one. Different owners,
different rotation schedules: RDS owns one, we own the other.

### `recovery_window_in_days = 0`

A deleted secret normally lingers 7–30 days, and **the name stays reserved for
the whole window**. Tear staging down and rebuild it inside that window and the
apply fails with `InvalidRequestException: You can't create this secret because
a secret with this name is already scheduled for deletion`. Staging sets 0 so a
destroy is really a destroy. Production should not.

---

## Adding a key

Two lines. In `terraform.tfvars`:

```hcl
app_secret_initial_values = {
  SESSION_SECRET       = "REPLACE_ME"
  STRIPE_SECRET_KEY    = "REPLACE_ME"
  STRIPE_WEBHOOK_SECRET = "REPLACE_ME"
}
```

and in the `ecs` module call in `main.tf`:

```hcl
secrets = {
  DB_PASSWORD       = "${module.rds.master_user_secret_arn}:password::"
  SESSION_SECRET    = "${module.secrets.app_secret_arn}:SESSION_SECRET::"
  STRIPE_SECRET_KEY = "${module.secrets.app_secret_arn}:STRIPE_SECRET_KEY::"
}
```

`ignore_changes` means adding a key to `app_secret_initial_values` does **not**
write it — the version resource is not recreated. Add the key to the live secret
too:

```powershell
$current = aws secretsmanager get-secret-value --secret-id charityapp-staging/app `
  --region ap-south-1 --query SecretString --output text | ConvertFrom-Json
$current | Add-Member -NotePropertyName STRIPE_SECRET_KEY -NotePropertyValue "REPLACE_ME"
aws secretsmanager put-secret-value --secret-id charityapp-staging/app --region ap-south-1 `
  --secret-string ($current | ConvertTo-Json -Compress)
```

**A missing key is a hard failure**, not a warning: the ECS agent cannot resolve
`:MISSING_KEY::`, the task never starts, and the circuit breaker rolls the
deployment back. Add the key to the secret before adding it to the task.

---

## Apply and roll

```powershell
cd infra\terraform\environments\staging
terraform apply

$cluster = terraform output -raw ecs_cluster_name
$service = terraform output -raw ecs_service_name
$family  = terraform output -raw ecs_task_definition_family

aws ecs update-service --cluster $cluster --service $service `
  --task-definition $family --force-new-deployment --region ap-south-1 | Out-Null
aws ecs wait services-stable --cluster $cluster --services $service --region ap-south-1
```

Same manual roll as Phase 5, and for the same reason — `ignore_changes` on
`task_definition`. Phase 7 is what removes this step.

---

## Verifying

There is no endpoint that echoes a secret, and there should not be. What proves
the wiring is that **the task starts at all**: a task whose execution role cannot
read a secret, or that references a missing JSON key, dies in `PROVISIONING`
with `ResourceInitializationError` and never reaches the load balancer.

```powershell
# both ARNs on the grant
aws iam get-role-policy --role-name charityapp-staging-task-execution-role `
  --policy-name charityapp-staging-task-execution-secrets `
  --query "PolicyDocument.Statement[0].Resource"

# both secrets on the task, as ARNs rather than values
aws ecs describe-task-definition --task-definition charityapp-staging-app --region ap-south-1 `
  --query "taskDefinition.containerDefinitions[0].secrets"

# and it is actually running
aws ecs describe-services --cluster $cluster --services $service --region ap-south-1 `
  --query "services[0].{Running:runningCount,TaskDef:taskDefinition}"
```

---

## Phase 6 done when

- [x] `charityapp-staging/app` exists with its keys
- [x] the execution role policy lists **both** secret ARNs
- [x] the task definition references both secrets by ARN, never by value
- [x] the service reaches steady state on the new revision — proof the agent resolved both
- [ ] real values replace the placeholders (do this when there is an app to use them)

Next: **Phase 7 — CI/CD** (Milestone 4: pipeline deploys). It also retires the
manual `update-service` roll, and gives the project a machine with Docker on it,
which is what unblocks the `/db-check` image left over from Phase 5.

---

## Notes for later phases

- **Nothing reads `SESSION_SECRET` yet.** It is injected into hello-world and
  ignored. That is the point: the pipe is proven before there is anything to send
  down it.
- **Rotation is per secret.** RDS can rotate its own on a schedule; this one would
  need a rotation lambda. Neither is on.
- **The values are `REPLACE_ME`.** Before anything real runs, replace them —
  `terraform plan` will not remind you, by design.
- **Production needs its own** `terraform.tfvars` block: same keys, its own values,
  and `secret_recovery_window_in_days` left at the default rather than 0.
