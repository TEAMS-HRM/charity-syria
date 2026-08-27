# Phase 3 — Compute + entry point (Milestone 1: container live)

Adds `modules/alb` and `modules/ecs` and wires both into staging. End state:
an internet-facing ALB in the public subnets forwards port 80 to a Fargate
service running the hello-world container in the private subnets.

Prereqs: Phases 0–2 applied (state backend, VPC/subnets/NAT, security groups,
ECR repo), AWS CLI + Docker on the machine, SSO profile `charityapp-admin`.

---

## What this phase creates

| Resource | Notes |
|---|---|
| `aws_lb` (`charityapp-staging-alb`) | internet-facing, public subnets, ALB SG |
| `aws_lb_target_group` (`-tg`) | `target_type = "ip"` — required for Fargate awsvpc |
| `aws_lb_listener` (HTTP :80) | forwards to the target group; Phase 4 turns this into a 301 to HTTPS |
| `aws_ecs_cluster` (`-cluster`) | Fargate capacity provider, Container Insights on |
| `aws_ecs_task_definition` (`-app`) | 256 CPU / 512 MiB, awsvpc, awslogs driver |
| `aws_ecs_service` (`-service`) | private subnets, `assign_public_ip = false`, circuit breaker + rollback |
| `aws_cloudwatch_log_group` (`/ecs/charityapp-staging`) | 14-day retention in staging |
| Task execution role + task role | execution role gets `AmazonECSTaskExecutionRolePolicy` (ECR pull + logs); task role is empty until the app needs AWS APIs |

Also changed in Phase 1's `modules/security`: the ALB SG now allows **port 80**
in addition to 443 (needed to prove the container over HTTP now, and kept in
Phase 4 for the 80→443 redirect), and the Fargate SG ingress port is driven by
the new `container_port` variable instead of a hardcoded `8080`.

---

## 1. Point the terminal at CharityApp

```powershell
$env:AWS_PROFILE = "charityapp-admin"
aws sso login --profile charityapp-admin
aws sts get-caller-identity      # must show account 667512624734
```

---

## 2. Push the hello-world image BEFORE applying

The ECS service starts a task the moment it is created. If the tag in
`terraform.tfvars` (`image_tag = "hello-world-v2"`) isn't in ECR, the task can't
pull, the deployment circuit breaker trips, and `terraform apply` fails.

The ECR repo is from Phase 2 — if it isn't applied yet:

```powershell
cd infra\terraform\environments\staging
terraform init
terraform apply -target=module.ecr
```

Then build and push:

```powershell
$acct   = (aws sts get-caller-identity --query Account --output text)
$region = "ap-south-1"
$repo   = "$acct.dkr.ecr.$region.amazonaws.com/charityapp-staging-app"

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin "$acct.dkr.ecr.$region.amazonaws.com"

cd ..\..\..\..\app\hello-world
docker build --platform linux/amd64 -t "${repo}:hello-world-v2" .
docker push "${repo}:hello-world-v2"
```

Confirm it landed:

```powershell
aws ecr describe-images --repository-name charityapp-staging-app --region ap-south-1 `
  --query "imageDetails[].imageTags"
```

> The repo is set to **IMMUTABLE** tags — you cannot overwrite `hello-world-v2`.
> To ship a new build, push a new tag and bump `image_tag` in `terraform.tfvars`.

---

## 3. Apply

```powershell
cd ..\..\infra\terraform\environments\staging
terraform init
terraform plan
terraform apply
```

Expect ~15 new resources. The ECS service is the slow one — Terraform waits for
the service to reach a steady state (a couple of minutes while the task starts
and the target group turns healthy).

---

## 4. Milestone 1 — prove the container is live

```powershell
# curl in Windows PowerShell is an alias for Invoke-WebRequest - use curl.exe
$url = terraform output -raw app_url
curl.exe "$url/health"     # {"status":"ok"}
curl.exe "$url/"           # {"message":"Hello from CharityApp"}
```

If it hangs or 503s, check in this order:

```powershell
# target health — should be "healthy"
aws elbv2 describe-target-health --target-group-arn (terraform output -raw target_group_arn) --region ap-south-1

# service events — pull failures and health-check kills show up here
aws ecs describe-services --cluster (terraform output -raw ecs_cluster_name) `
  --services (terraform output -raw ecs_service_name) --region ap-south-1 `
  --query "services[0].events[:10]"

# container logs
aws logs tail (terraform output -raw ecs_log_group_name) --since 15m --region ap-south-1
```

Common causes: image tag not in ECR (task stuck in PENDING → STOPPED),
health check path wrong, or the Fargate SG not allowing 8080 from the ALB SG.

---

## Phase 3 done when
- [ ] Image `hello-world-v2` is in ECR
- [ ] `terraform apply` completes with the service at steady state
- [ ] Target group shows 1 healthy target
- [ ] `curl.exe http://<alb-dns>/health` returns `{"status":"ok"}` ← **Milestone 1**

Next: **Phase 4 — ACM wildcard cert + Route53 + HTTPS listener** (the HTTP
listener created here becomes the 80→443 redirect).

---

## Notes for later phases
- `aws_ecs_service` has `lifecycle { ignore_changes = [task_definition] }` so the
  Phase 7 CI/CD pipeline can roll new image revisions without Terraform fighting
  it. Terraform still owns the *shape* of the task definition.
- `enable_execute_command` (ECS Exec) is off by default; flip it on the module
  call if you need a shell inside a running task to debug RDS connectivity in
  Phase 5. It also attaches the required `ssmmessages:*` policy to the task role.
- Secrets (Phase 6) go in as a `secrets` block on the container definition plus
  a read policy on the **execution** role — not as `environment_variables`.
