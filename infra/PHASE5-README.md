# Phase 5 — Database (Milestone 3: DB reachable)

Adds `modules/rds`, teaches `modules/ecs` to read Secrets Manager, and gives the
hello-world container a `/db-check` endpoint. End state: a private PostgreSQL
instance in the Phase 1 subnets, its master password owned by Secrets Manager,
and a running Fargate task that proves it can reach it.

Prereqs: Phase 4 applied and green (Milestone 2), Docker, AWS CLI + SSO profile
`charityapp-admin`.

> **Staging status, 2026-08-27.** Complete. The database is `available`, the
> secret injects, and the service runs an image built by the Phase 7 pipeline.
> `/db-check` answers over TLS - **Milestone 3 closed**. The hand-built image
> workaround in step 1 was never needed: the GitHub Actions runner built it.

---

## What this phase creates

| Resource | Where | Notes |
|---|---|---|
| `aws_db_subnet_group` | `modules/rds` | both private subnets, so a Multi-AZ failover has somewhere to land |
| `aws_db_parameter_group` | `modules/rds` | `rds.force_ssl = 1`, slow-query logging at 1s |
| `aws_db_instance` | `modules/rds` | postgres 16, `db.t4g.micro`, encrypted gp3, **not** publicly accessible |
| *(RDS-managed secret)* | AWS, not Terraform | `manage_master_user_password = true` — RDS generates the password and owns the secret |
| `aws_iam_role_policy` (`-task-execution-secrets`) | `modules/ecs` | lets the **execution** role read the secret at task start |
| task definition revision | `modules/ecs` | adds `DB_*` env vars + a `secrets` entry for `DB_PASSWORD` |

Existing pieces this phase leans on and does not change: the RDS security group
(`PostgreSQL from Fargate only`) and the private subnets, both created in Phase 1.

### Where the password lives

Nowhere in this repo, and nowhere in Terraform state. `manage_master_user_password`
hands generation, storage and rotation to RDS + Secrets Manager. Terraform only
ever sees the secret's **ARN**.

The container gets it the same way:

```hcl
secrets = {
  DB_PASSWORD = "${module.rds.master_user_secret_arn}:password::"
}
```

The `:password::` suffix pulls one field out of the JSON secret. The ECS agent
resolves it at task start using the execution role, so the value never lands in
the task definition either — `aws ecs describe-task-definition` shows the ARN,
not the password.

Host, port, database name and user are plain environment variables. They aren't
secret, and an app that builds its own connection string from parts survives a
password rotation without a redeploy.

### Why plain RDS and not Aurora

For a staging skeleton a single `db.t4g.micro` is the cheapest thing that is
really PostgreSQL. Aurora Serverless v2 floors at 0.5 ACU and costs more to sit
idle. The module boundary is what matters: swapping in `aws_rds_cluster` later
changes `modules/rds` and nothing that calls it.

### Staging vs production

Staging is deliberately disposable. The same module, different `.tfvars`:

| Variable | staging | production |
|---|---|---|
| `db_instance_class` | `db.t4g.micro` | `db.t4g.medium` |
| `db_multi_az` | `false` | `true` |
| `db_deletion_protection` | `false` | `true` |
| `db_skip_final_snapshot` | `true` | `false` |
| `enable_db_check` | `true` | `false` |

Module defaults are the **safe** ones (protection on, final snapshot taken).
Staging opts out explicitly; a new environment that forgets to set anything gets
the careful behaviour.

---

## 1. Build and push the image

`/db-check` ships in `app/hello-world/server.js` but **is not in any pushed
image**. `terraform.tfvars` therefore stays at `image_tag = "hello-world-v2"` -
pointing it at a tag that does not exist in ECR fails the ECS deployment and the
circuit breaker rolls it back.

This machine has no `docker`, `podman` or `nerdctl`, so the build has to happen
somewhere that does. Once it can:

```powershell
$env:AWS_PROFILE = "charityapp-admin"
aws sso login --profile charityapp-admin
aws sts get-caller-identity      # must show account 667512624734

$acct   = (aws sts get-caller-identity --query Account --output text)
$region = "ap-south-1"
$repo   = "$acct.dkr.ecr.$region.amazonaws.com/charityapp-staging-app"

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin "$acct.dkr.ecr.$region.amazonaws.com"

cd app\hello-world
docker build --platform linux/amd64 -t "${repo}:hello-world-v3" .
docker push "${repo}:hello-world-v3"
```

Then set `image_tag = "hello-world-v3"` in `terraform.tfvars`, re-apply, and roll
the service (step 3). The ECR repo uses **immutable tags**: if `hello-world-v3`
is ever taken, move to `v4` rather than overwriting.

No build tool anywhere? Step 4 has an alternative that needs no local Docker.

## 2. Apply

```powershell
cd ..\..\infra\terraform\environments\staging
terraform init
terraform plan
terraform apply
```

Expect **5 to add, 1 to destroy**. The destroy is the previous task definition
revision being superseded — not the service, and not anything running.

`aws_db_instance` takes **8-12 minutes**. Terraform looks frozen for most of it;
that's normal.

## 3. Roll the service onto the new revision

`aws_ecs_service` carries `lifecycle { ignore_changes = [task_definition] }` so
the Phase 7 pipeline can deploy without Terraform fighting it. The side effect:
**`terraform apply` creates the new revision but does not start it.** Until
Phase 7 exists, roll it by hand:

```powershell
$cluster = terraform output -raw ecs_cluster_name
$service = terraform output -raw ecs_service_name
$family  = terraform output -raw ecs_task_definition_family

aws ecs update-service --cluster $cluster --service $service `
  --task-definition $family --force-new-deployment --region ap-south-1 | Out-Null

aws ecs wait services-stable --cluster $cluster --services $service --region ap-south-1
```

Passing the **family** with no `:revision` tells ECS to take the latest active
revision.

---

## 4. Milestone 3 — prove the task reaches Postgres

```powershell
curl.exe "https://staging.charity-syria.com/db-check"
```

```json
{
  "configured": true,
  "host": "charityapp-staging-db.xxxxxxxx.ap-south-1.rds.amazonaws.com",
  "port": 5432,
  "database": "charityapp",
  "user": "charityapp_admin",
  "passwordInjected": true,
  "reachable": true,
  "speaksPostgres": true,
  "tls": "offered",
  "elapsedMs": 12
}
```

Each field is a separate claim:

- `passwordInjected: true` — the execution role read the secret and the ECS agent
  injected it. IAM and Secrets Manager wiring is good.
- `reachable: true` — the task opened a TCP connection into the private subnet.
  Security groups and routing are good.
- `speaksPostgres: true` — the endpoint answered a PostgreSQL `SSLRequest`, so
  it's the database, not something else on port 5432.
- `tls: "offered"` — `rds.force_ssl` is in effect.

The probe is a raw socket and an 8-byte handshake
([app/hello-world/server.js](../app/hello-world/server.js)) — no driver, no
dependency, nothing added to the image.

`/db-check` is public through the ALB and reports the database hostname and user,
so it is gated behind `enable_db_check`. It's `true` in staging and must stay
`false` everywhere real. With it off the path is a plain 404.

### Proving it without the image

Until `/db-check` is deployed, the connection can still be proven from inside the
VPC: register a throwaway task definition using the public
`public.ecr.aws/docker/library/postgres:16-alpine` image, run it once with
`aws ecs run-task` in the **private subnets with the Fargate security group**,
have it run `pg_isready` (or `psql -c "select 1"` with the password from Secrets
Manager) against `db_address`, read the result out of the existing log group, then
deregister it. Fargate pulls the image over the NAT gateway, so nothing has to be
built locally. This is a diagnostic, not infrastructure - it stays out of
Terraform.

### Read the credentials yourself

```powershell
aws secretsmanager get-secret-value --secret-id (terraform output -raw db_secret_arn) `
  --region ap-south-1 --query SecretString --output text
```

### Connect a psql session (optional)

The instance has no public address by design, so this needs a path into the VPC.
Cheapest is ECS Exec into the running task — set `enable_execute_command = true`
on the `ecs` module call, re-apply, roll the service, then
`aws ecs execute-command`. Note the distroless image has no shell, so this needs
a debug image to be useful. A bastion or SSM port-forward is the other route.
Neither is needed for Milestone 3.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `/db-check` returns 404 | the old revision is still running (step 3 not done), or `enable_db_check = false` |
| `"configured": false` | same — `DB_HOST` only exists on the new revision |
| `reachable: false`, `"timeout"` | security group chain. RDS SG must allow 5432 from the **Fargate SG**, not a CIDR |
| `reachable: false`, `ENOTFOUND` | wrong hostname — compare against `terraform output db_address` |
| `passwordInjected: false` | can't normally happen: a task that can't resolve its secrets never starts |
| task stuck, `ResourceInitializationError: unable to pull secrets` | execution role missing the read grant, or the task lost its NAT route to Secrets Manager |
| `CannotPullContainerError` | `hello-world-v3` was never pushed — step 1 |
| 503 from the ALB | target group unhealthy; `/health` never touches the database, so this is a Phase 3 problem |

```powershell
# what the running task actually got
aws ecs describe-services --cluster $cluster --services $service --region ap-south-1 `
  --query "services[0].{Running:runningCount,Desired:desiredCount,TaskDef:taskDefinition}"

aws logs tail (terraform output -raw ecs_log_group_name) --since 15m --region ap-south-1

aws rds describe-db-instances --db-instance-identifier charityapp-staging-db --region ap-south-1 `
  --query "DBInstances[0].{Status:DBInstanceStatus,AZ:AvailabilityZone,Public:PubliclyAccessible,Endpoint:Endpoint.Address}"
```

---

## Cost

`db.t4g.micro` + 20 GiB gp3 + 7 days of backups is roughly **$15-20/month** in
`ap-south-1` — the largest line item added so far, and it bills whether or not
anything connects. Storage autoscales to 100 GiB, so a runaway table is a cost
event rather than an outage. Phase 8 puts a Budget alarm on this.

`terraform destroy` works on staging (`deletion_protection = false`,
`skip_final_snapshot = true`) if you want it gone between working sessions. That
combination is exactly what production must not have.

---

## Phase 5 done when

- [x] `aws rds describe-db-instances` shows status `available`, `PubliclyAccessible: false`
- [x] `terraform output db_secret_arn` resolves to a secret containing a password
- [x] the service is running the revision with `DB_*` env vars
- [x] `curl.exe https://staging.charity-syria.com/db-check` returns `reachable: true`
      and `speaksPostgres: true`  <- **Milestone 3**

Next: **Phase 6 — Secrets & config** (per-environment secret entries, Stripe keys
later, and the app reading them all the same way).

---

## Notes for later phases

- **Phase 6 adds an *application* secret** alongside the RDS-managed one — Stripe
  keys, a session key, whatever the app needs. Same pattern: one `secrets` entry
  per variable, one ARN in `secret_arns`. The `modules/ecs` plumbing built here
  takes any number of them.
- **`rds.force_ssl = 1` is enforced.** Real drivers need `sslmode=require` at
  minimum, and the RDS CA bundle for `verify-full`. Expect a connection refusal
  the first time the app connects without it.
- **Schema-per-tenant uses the master user for now.** Before real data, the app
  should connect as a least-privilege user that can create schemas but not drop
  the database. That's app-phase work, and it needs a migration path since the
  master credential is the only one that exists today.
- **RDS Proxy** becomes worth it when Fargate scales out — every task holds its
  own pool, and `db.t4g.micro` tops out around 80 connections. Not yet.
- **Rotation is available but not on.** `manage_master_user_password` supports a
  managed rotation schedule; turning it on is a one-line addition once the app
  reads the secret at startup rather than caching it forever.
- **Backups are on (7 days) but untested.** Phase 8 restores one, which is the
  only thing that makes a backup real.
