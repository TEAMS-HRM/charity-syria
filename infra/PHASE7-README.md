# Phase 7 — CI/CD (Milestone 4: pipeline deploys)

Adds `global/github-oidc`, `modules/cicd-oidc-role` and `.github/workflows/`.
End state: a merge to `main` builds the image, pushes it to ECR, rolls the
Fargate service and smoke-tests the result — with no AWS keys stored anywhere.

Prereqs: Phase 6 applied. A GitHub repository. No Docker needed locally, ever
again — the runner has it.

> **Status, 2026-08-27.** AWS side applied and verified: the OIDC provider
> exists, `charityapp-staging-github-deploy` trusts both spellings of the repo
> subject, and its permissions are scoped to this environment's ARNs. Code is
> pushed to `TEAMS-HRM/charity-syria` (public, by decision). The first pipeline
> run fired automatically and **failed at assume-role**; the trust policy has
> since been fixed. Awaiting a re-run — see "Before the first run".

---

## What this phase creates

| Resource | Where | Notes |
|---|---|---|
| `aws_iam_openid_connect_provider` | `global/github-oidc` | account-wide singleton, `prevent_destroy` |
| `aws_iam_role` (`-github-deploy`) | `modules/cicd-oidc-role` | trusts one repo + one GitHub Environment |
| `aws_iam_role_policy` | `modules/cicd-oidc-role` | ECR push, ECS deploy, scoped `PassRole` |
| `deploy.yml` | `.github/workflows` | reusable: build → push → deploy → smoke test |
| `deploy-staging.yml` | `.github/workflows` | on merge to `main`, no gate |
| `deploy-production.yml` | `.github/workflows` | `workflow_dispatch` + typed confirmation + environment gate |

### Why the OIDC provider is global

Exactly one provider for `token.actions.githubusercontent.com` can exist per AWS
account. If staging and production each declared it, whichever applied second
would fail — and a `terraform destroy` of one environment would break the other's
pipeline. So it lives in `global/`, alongside the hosted zone, for the same
reason: **shared, therefore owned by neither.** Environments find it with a data
source.

### No access keys, anywhere

There are no AWS credentials in GitHub secrets. The workflow asks GitHub for a
short-lived OIDC token, hands it to STS, and gets a session that expires in an
hour. The trust policy is the entire security boundary:

```json
"token.actions.githubusercontent.com:sub": "repo:TEAMS-HRM/charity-syria:environment:staging"
```

`StringEquals`, not `StringLike` - no wildcards. A fork, a feature branch, or a
different repo presents a different `sub` and is refused by STS before any AWS
call happens.

### Two spellings of the same repository

The first pipeline run failed here with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`. GitHub had presented:

```
repo:TEAMS-HRM@24827849/charity-syria@1348619135:environment:staging
```

not the documented `repo:TEAMS-HRM/charity-syria:environment:staging`. The newer
**immutable subject** form embeds the numeric owner and repository ids, so that
deleting a repo and recreating one with the same name does not inherit its AWS
access. It is the better claim - but `StringEquals` against the name-based form
does not match it.

The role trusts **both** spellings. They name the same repository, GitHub decides
which to send, and trusting both is the only way to be correct on either side of
that rollout. The ids come from `https://api.github.com/repos/<org>/<repo>` and
are set as `github_org_id` / `github_repo_id`.

This is also the argument for CloudTrail over workflow logs when debugging OIDC:
GitHub Actions logs say only "not authorized", while the CloudTrail
`AssumeRoleWithWebIdentity` event records the exact claim that was presented.


Note the claim says `environment:staging`, not `ref:refs/heads/main`. A job
pinned to a GitHub Environment presents that form instead. It is the stronger
choice: **the environment is where required reviewers live**, so for production
the approval gate and the AWS trust boundary are the same object. An approval
cannot be skipped by pushing to a clever branch name.

### What the role may actually do

Scoped to this environment's ARNs, verified after apply:

| Statement | Resource |
|---|---|
| `ECRPushPull` | the staging ECR repository only |
| `ECSDeploy` (`UpdateService`) | the staging service only |
| `PassTaskRoles` | the two staging task roles only |
| `ECRAuth`, `ECSTaskDefinitions`, `ECSInspectTasks` | `*` — see below |

Three statements are unavoidably `*`. `ecr:GetAuthorizationToken` and
`ecs:RegisterTaskDefinition` / `DescribeTaskDefinition` have **no resource-level
permissions in IAM**; AWS rejects anything but `*`. `ListTasks`/`DescribeTasks`
take per-run ARNs, so they are constrained by an `ecs:cluster` condition instead.

`PassRole` is the one that matters. Registering a task definition means telling
ECS what role the container runs as. Unscoped, this role could register a task
running as *any* role in the account and start it — a straight privilege
escalation. Restricted to the two task roles, it cannot.

### One workflow, two environments

`deploy.yml` is a `workflow_call` reusable workflow; the two callers pass
different inputs. Production is a variable change, not a copy — the same rule the
Terraform follows. The deploy itself:

1. Build and push, tagged with **the commit SHA**. Immutable ECR tags mean a tag
   is never silently rebuilt, and any running task traces back to a commit.
2. `describe-task-definition` first, then swap only the image. This is what keeps
   the `DB_*` variables and the Phase 5/6 secrets from being dropped on deploy.
3. `wait-for-service-stability: true`, so a failed rollout fails the job instead
   of rolling back quietly while the pipeline reports success.
4. Smoke test `/health` through the ALB, retried five times. A green deploy only
   proves the container started, not that it serves.

---

## Before the first run

**1. Push the code.** Done — `main` on `TEAMS-HRM/charity-syria`.

**2. Repository visibility.** The repo is **public**, by decision. The
`.gitignore` keeps state, plans and `.terraform/` out, and no password exists in
any tracked file — the RDS credential lives only in Secrets Manager, which is
what makes this survivable. What *is* public is infrastructure metadata: the AWS
account ID, the state bucket name, the ALB, and every VPC/subnet/SG ID. None of
it grants access on its own. Two things follow from that choice:

- The Phase 8 Budget alarm matters more, not less — a public account ID is the
  starting point for opportunistic probing.
- Never commit a `.tfvars` containing a real secret value. The current one holds
  only sizes, domains and placeholders, and it must stay that way.

**2b. Re-run the failed pipeline.** The first run failed at assume-role before
the trust policy was fixed. Actions → *deploy staging* → **Run workflow**. A
`git push` will not re-trigger it unless the commit touches `app/**` or a
workflow file.

**3. Create the `production` environment with required reviewers.** Settings →
Environments → New environment → `production` → Required reviewers. **Without
this the production gate does not exist** — the workflow would deploy on
dispatch with no approval. The `staging` environment is created automatically on
first use and needs no reviewers.

**4. Nothing to add to GitHub secrets.** By design.

---

## Milestone 4 — prove the pipeline deploys

Merge anything under `app/` to `main`, or run the workflow manually. Then:

```powershell
# the pipeline's image is tagged with the commit SHA
aws ecs describe-services --cluster charityapp-staging-cluster `
  --services charityapp-staging-service --region ap-south-1 `
  --query "services[0].taskDefinition"

aws ecs describe-task-definition --task-definition charityapp-staging-app `
  --region ap-south-1 --query "taskDefinition.containerDefinitions[0].image"
```

The image tag should be the merged commit's SHA, and the workflow's smoke-test
step should show `{"status":"ok"}`.

**This is also what finishes Phase 5.** The runner builds `app/hello-world`,
which contains `/db-check`. The first successful pipeline run ships it, and
Milestone 3 closes without any of the local image work:

```powershell
curl.exe "https://staging.charity-syria.com/db-check"
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | the job's `sub` claim does not match the trust policy. Read the real claim from the CloudTrail event, not the workflow log, and compare against `terraform output cicd_allowed_subjects`. Usually the immutable id form - see above |
| `Credentials could not be loaded` | the workflow is missing `permissions: id-token: write` |
| `denied: requested access to the resource is denied` on push | image built for the wrong repo, or the role is staging's while the target is production's |
| Deploy succeeds, smoke test fails | container started but is not serving — check the log group, then the target group |
| `InvalidParameterException: The container app does not exist` | `container_name` input does not match the task definition |
| Job waits forever on production | working as intended — a reviewer has to approve |

---

## Phase 7 done when

- [x] OIDC provider exists in the account
- [x] deploy role trusts exactly one repo + environment, scoped to this environment's ARNs
- [x] workflows written and YAML-valid
- [ ] code pushed to `TEAMS-HRM/charity-syria`
- [ ] repository visibility decided
- [ ] `production` environment created with required reviewers
- [ ] a merge to `main` deploys staging and the smoke test passes ← **Milestone 4**
- [ ] `/db-check` answers, closing **Milestone 3**

Next: **Phase 8 — Safety nets** (CloudWatch alarms, AWS Budgets, a tested RDS
restore). The Budget alarm is the urgent one: RDS started billing on 2026-08-27
and nothing is watching the account spend.

---

## Notes for later phases

- **Production needs `environments/production` before its workflow can run.**
  Same modules, different `.tfvars`: `db_multi_az = true`,
  `db_deletion_protection = true`, `enable_db_check = false`,
  `domain_name = "charity-syria.com"`.
- **The deploy role does not run Terraform.** It can push an image and roll a
  service, nothing else. Infrastructure changes stay on a workstation with SSO.
  Giving CI Terraform rights means giving it near-admin, and that is a much
  larger decision than this phase.
- **`ignore_changes = [task_definition]`** on the service exists precisely for
  this pipeline. With Phase 7 live, the manual `update-service` step from Phases
  5 and 6 is retired.
- **Rollback** is `aws ecs update-service --task-definition <family>:<older>`.
  Every prior revision is still there.
