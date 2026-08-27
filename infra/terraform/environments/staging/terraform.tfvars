aws_region   = "ap-south-1"
project_name = "charityapp"
environment  = "staging"

vpc_cidr             = "10.10.0.0/16"
availability_zones   = ["ap-south-1a", "ap-south-1b"]
public_subnet_cidrs  = ["10.10.0.0/24", "10.10.1.0/24"]
private_subnet_cidrs = ["10.10.10.0/24", "10.10.11.0/24"]

container_port    = 8080
health_check_path = "/health"

# Bootstrap from the latest successfully deployed API image. Normal releases
# remain owned by GitHub Actions, which tags each image with its commit SHA.
image_tag          = "681c83da5fc3314cdce3678e2e6c695686fd008e"
task_cpu           = 256
task_memory        = 512
desired_count      = 1
log_retention_days = 14

# Phase 4 - domain & TLS.
# Set domain_name to "" to keep staging on plain HTTP (no ACM, no Route53).
root_domain = "charity-syria.com"
domain_name = "staging.charity-syria.com"

# Phase 5 - database.
# Staging is sized and configured to be cheap and disposable. Production flips
# multi_az, deletion_protection and skip_final_snapshot the other way.
db_name                    = "charityapp"
db_master_username         = "charityapp_admin"
db_engine_version          = "16"
db_parameter_group_family  = "postgres16"
db_instance_class          = "db.t4g.micro"
db_allocated_storage       = 20
db_max_allocated_storage   = 100
db_multi_az                = false
db_backup_retention_period = 7
db_deletion_protection     = false
db_skip_final_snapshot     = true

log_level = "info"

# Phase 6 - application secrets.
# Placeholders only. Terraform creates these keys once and then stops tracking
# the values, so replacing them with real ones does not cause drift.
app_secret_initial_values = {
  SESSION_SECRET = "REPLACE_ME"
}

# 0 so `terraform destroy` really removes the secret. A non-zero window reserves
# the name and blocks recreating staging until it expires.
secret_recovery_window_in_days = 0

# Phase 7 - CI/CD.
# Empty github_repo disables the deploy role, leaving the environment
# deployable only from a workstation.
github_org  = "TEAMS-HRM"
github_repo = "charity-syria"

# GitHub now sends an immutable subject claim embedding these numeric ids
# (repo:TEAMS-HRM@24827849/charity-syria@1348619135:environment:staging).
# Without them the trust policy does not match and STS refuses the deploy.
github_org_id  = "24827849"
github_repo_id = "1348619135"
