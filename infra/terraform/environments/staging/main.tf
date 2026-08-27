locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  # One switch drives all of Phase 4. Leave domain_name empty and the
  # environment stays on plain HTTP against the ALB DNS name - useful before
  # the domain's nameservers point at Route53.
  tls_enabled = var.domain_name != ""
}

# The hosted zone is shared by staging and production, so it lives in
# global/dns and is looked up here rather than owned by this state.
data "aws_route53_zone" "root" {
  count = local.tls_enabled ? 1 : 0

  name         = var.root_domain
  private_zone = false
}

module "networking" {
  source = "../../modules/networking"

  name_prefix          = local.name_prefix
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = local.common_tags
}

module "security" {
  source = "../../modules/security"

  name_prefix    = local.name_prefix
  vpc_id         = module.networking.vpc_id
  container_port = var.container_port
  tags           = local.common_tags
}

module "ecr" {
  source = "../../modules/ecr"

  repository_name = "${local.name_prefix}-app"
  tags            = local.common_tags
}

# Must be issued before the ALB can terminate TLS, so it comes first.
module "acm" {
  source = "../../modules/acm"
  count  = local.tls_enabled ? 1 : 0

  name_prefix               = local.name_prefix
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  hosted_zone_id            = data.aws_route53_zone.root[0].zone_id
  tags                      = local.common_tags
}

module "alb" {
  source = "../../modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  security_group_ids = [module.security.alb_security_group_id]
  container_port     = var.container_port
  health_check_path  = var.health_check_path
  enable_https       = local.tls_enabled
  certificate_arn    = one(module.acm[*].certificate_arn)
  tags               = local.common_tags
}

# Application configuration, separate from the RDS-managed credential. Created
# with placeholder values; the real ones are written out of band.
module "secrets" {
  source = "../../modules/secrets"

  name_prefix             = local.name_prefix
  recovery_window_in_days = var.secret_recovery_window_in_days
  initial_values          = var.app_secret_initial_values
  tags                    = local.common_tags
}

# Placed before the ECS module because the task reads its endpoint and
# credentials. Terraform would order it either way; this keeps the file
# readable top to bottom.
module "rds" {
  source = "../../modules/rds"

  name_prefix        = local.name_prefix
  private_subnet_ids = module.networking.private_subnet_ids
  security_group_ids = [module.security.rds_security_group_id]

  db_name         = var.db_name
  master_username = var.db_master_username

  engine_version         = var.db_engine_version
  parameter_group_family = var.db_parameter_group_family
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  max_allocated_storage  = var.db_max_allocated_storage
  multi_az               = var.db_multi_az

  backup_retention_period = var.db_backup_retention_period
  deletion_protection     = var.db_deletion_protection
  skip_final_snapshot     = var.db_skip_final_snapshot

  tags = local.common_tags
}

module "ecs" {
  source = "../../modules/ecs"

  name_prefix        = local.name_prefix
  aws_region         = var.aws_region
  container_image    = "${module.ecr.repository_url}:${var.image_tag}"
  container_port     = var.container_port
  task_cpu           = var.task_cpu
  task_memory        = var.task_memory
  desired_count      = var.desired_count
  private_subnet_ids = module.networking.private_subnet_ids
  security_group_ids = [module.security.fargate_security_group_id]
  target_group_arn   = module.alb.target_group_arn
  log_retention_days = var.log_retention_days

  environment_variables = {
    PORT    = tostring(var.container_port)
    DB_HOST = module.rds.address
    DB_PORT = tostring(module.rds.port)
    DB_NAME = module.rds.db_name
    DB_USER = module.rds.master_username

    # Diagnostic endpoint, public through the ALB. On for staging, off for
    # production.
    DB_CHECK_ENABLED = tostring(var.enable_db_check)
  }

  # The trailing :password:: pulls one field out of the JSON secret RDS
  # manages, so the container gets the password and nothing else.
  secrets = {
    DB_PASSWORD = "${module.rds.master_user_secret_arn}:password::"

    # Same mechanism, different secret. Adding a key is one line here plus one
    # key in app_secret_initial_values.
    SESSION_SECRET = "${module.secrets.app_secret_arn}:SESSION_SECRET::"
  }

  secret_arns = [
    module.rds.master_user_secret_arn,
    module.secrets.app_secret_arn,
  ]

  tags = local.common_tags

  # The service cannot register targets until the listener exists.
  depends_on = [module.alb]
}

# Lets GitHub Actions deploy this environment without any long-lived AWS keys.
# Scoped to one repo, one GitHub Environment, and this environment's ARNs.
module "cicd_oidc_role" {
  source = "../../modules/cicd-oidc-role"
  count  = var.github_repo == "" ? 0 : 1

  github_org           = var.github_org
  github_repo          = var.github_repo
  github_org_id        = var.github_org_id
  github_repo_id       = var.github_repo_id
  allowed_environments = [var.environment]
  role_name            = "${local.name_prefix}-github-deploy"

  ecr_repository_arn = module.ecr.repository_arn
  ecs_cluster_arn    = module.ecs.cluster_arn
  ecs_service_arn    = module.ecs.service_arn
  passable_role_arns = [
    module.ecs.task_execution_role_arn,
    module.ecs.task_role_arn,
  ]

  tags = local.common_tags
}

# Points the domain and its wildcard at the ALB, so any <tenant>.<domain>
# resolves without a DNS change per tenant.
module "dns" {
  source = "../../modules/dns"
  count  = local.tls_enabled ? 1 : 0

  hosted_zone_id = data.aws_route53_zone.root[0].zone_id
  domain_name    = var.domain_name
  alb_dns_name   = module.alb.alb_dns_name
  alb_zone_id    = module.alb.alb_zone_id
}
