# Phase 0 — What to run, in order

Console steps (Organizations, member account, root MFA, IAM admin) are done by
hand — see the chat checklist. Below are the **code parts** and how to apply them.

Prereqs: Terraform >= 1.6, AWS CLI configured to assume into the **CharityApp**
account (via `OrganizationAccountAccessRole`).

---

## 1. Edit the placeholders first

In `terraform/global/bootstrap/main.tf`:
- `state_bucket_name` → must be **globally unique**. Replace `CHANGE-ME`
  (e.g. `charityapp-tfstate-4f2a`).
- `region` → confirm (default `eu-west-2` / London).

---

## 2. Apply the bootstrap (ONCE, local state)

```bash
cd terraform/global/bootstrap
terraform init          # local state — no backend yet
terraform apply
```

Note the outputs: `state_bucket`, `lock_table`, `region`. You'll need them for
every environment's `backend.tf`.

---

## 3. Wire environments to remote state

Use `terraform/global/bootstrap/backend.hcl.example` as the template. Each
environment (staging, production) gets a `backend.tf` with the SAME bucket/table
but a DIFFERENT `key` (`staging/terraform.tfstate` vs `production/...`).

You'll create these when you build Phase 1 environments — not needed yet.

---

## 4. GitHub OIDC deploy role

The `modules/cicd-oidc-role` module is ready but is CALLED from an environment
(Phase 7 / CI-CD), not applied standalone. When you get there:

```hcl
module "cicd_oidc" {
  source       = "../../modules/cicd-oidc-role"
  github_org   = "your-github-org"
  github_repo  = "charityapp"
  allowed_refs = ["refs/heads/main", "refs/heads/staging"]
  role_name    = "charityapp-github-deploy"
}
```

- If this account already has a GitHub OIDC provider (e.g. from ScreenHRM),
  set `create_oidc_provider = false`.
- The permission statements are a starting point — tighten the `resources = ["*"]`
  TODOs to real ECR/ECS ARNs once those exist (Phases 2–3).
- Output `role_arn` goes into your GitHub Actions workflow as `role-to-assume`.

---

## Phase 0 done when
- [ ] Organizations enabled; CharityApp member account created
- [ ] Root locked down (MFA) on management + CharityApp accounts
- [ ] You can assume admin into CharityApp
- [ ] `global/bootstrap` applied → state bucket + lock table exist
- [ ] (OIDC role deferred to Phase 7, module is ready)

Next: **Phase 1 — networking** (VPC, subnets, IGW, NAT, security groups).
