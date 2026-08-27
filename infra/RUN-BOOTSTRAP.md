# Run the bootstrap — exact steps (Windows / PowerShell)

This creates the S3 state bucket + DynamoDB lock table in the CharityApp
account (`667512624734`). It's the last step of Phase 0.

Prereqs (all done): AWS CLI v2, Terraform, SSO profile `charityapp-admin`.

---

## 1. Edit the bucket name (REQUIRED)

Open `terraform/global/bootstrap/main.tf`. Find:

    default = "charityapp-tfstate-CHANGE-ME"

Replace `CHANGE-ME` with random characters (S3 names are globally unique), e.g.:

    default = "charityapp-tfstate-jk7f2a9x"

Region is already set to `ap-south-1` (Mumbai). Save.

---

## 2. Point terminal at CharityApp

    $env:AWS_PROFILE = "charityapp-admin"
    aws sso login --profile charityapp-admin
    aws sts get-caller-identity

Confirm the output shows account **667512624734**. (Safety: make sure it's
NOT your ScreenHRM account before creating anything.)

---

## 3. Go to the bootstrap folder

    cd <where-you-saved>\infra\terraform\global\bootstrap

---

## 4. Init — downloads the AWS provider (creates nothing)

    terraform init

Healthy output ends with:  "Terraform has been successfully initialized!"

---

## 5. Plan — preview (creates nothing)

    terraform plan

Healthy output ends with something like:  "Plan: 6 to add, 0 to change, 0 to destroy."
Nothing should say "destroy."

---

## 6. Apply — creates the resources for real

    terraform apply

It shows the plan, then asks to confirm. Type:  yes

Healthy output ends with:

    Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
    Outputs:
    lock_table   = "charityapp-tf-locks"
    region       = "ap-south-1"
    state_bucket = "charityapp-tfstate-jk7f2a9x"

---

## 7. SAVE the outputs

Copy `state_bucket` and `lock_table` somewhere. Every future environment
(staging, production) points its backend.tf at these.

---

## Common errors

- BucketAlreadyExists      -> name not unique; change it, re-run apply
- ExpiredToken / auth      -> aws sso login --profile charityapp-admin
- AccessDenied             -> confirm get-caller-identity shows AdministratorAccess
- Wrong account in output  -> fix $env:AWS_PROFILE before applying

---

## When this succeeds

Phase 0 is COMPLETE. Next is Phase 1 — networking (VPC, subnets, security groups).
