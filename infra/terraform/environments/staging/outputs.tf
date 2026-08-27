output "vpc_id" {
  description = "ID of the staging VPC."
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the staging public subnets."
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the staging private subnets."
  value       = module.networking.private_subnet_ids
}

output "nat_gateway_id" {
  description = "ID of the staging NAT gateway."
  value       = module.networking.nat_gateway_id
}

output "alb_security_group_id" {
  description = "ID of the staging ALB security group."
  value       = module.security.alb_security_group_id
}

output "fargate_security_group_id" {
  description = "ID of the staging Fargate security group."
  value       = module.security.fargate_security_group_id
}

output "rds_security_group_id" {
  description = "ID of the staging RDS security group."
  value       = module.security.rds_security_group_id
}

output "ecr_repository_arn" {
  description = "ARN of the staging application image repository."
  value       = module.ecr.repository_arn
}

output "ecr_repository_name" {
  description = "Name of the staging application image repository."
  value       = module.ecr.repository_name
}

output "ecr_repository_url" {
  description = "URL of the staging application image repository."
  value       = module.ecr.repository_url
}
output "alb_dns_name" {
  description = "Public DNS name of the staging load balancer."
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Route53 hosted zone ID of the staging load balancer."
  value       = module.alb.alb_zone_id
}

output "alb_arn" {
  description = "ARN of the staging load balancer."
  value       = module.alb.alb_arn
}

output "target_group_arn" {
  description = "ARN of the staging target group."
  value       = module.alb.target_group_arn
}

output "ecs_cluster_name" {
  description = "Name of the staging ECS cluster."
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "Name of the staging ECS service."
  value       = module.ecs.service_name
}

output "ecs_task_definition_family" {
  description = "Task definition family used by the staging service."
  value       = module.ecs.task_definition_family
}

output "ecs_log_group_name" {
  description = "CloudWatch log group receiving staging container logs."
  value       = module.ecs.log_group_name
}

output "app_url" {
  description = "Primary URL for the environment: the domain over TLS once Phase 4 is applied, the ALB over HTTP before that."
  value       = var.domain_name == "" ? "http://${module.alb.alb_dns_name}" : "https://${var.domain_name}"
}

output "alb_url" {
  description = "Direct ALB URL. With TLS on this redirects to HTTPS and the certificate will not match this hostname - that is expected."
  value       = "http://${module.alb.alb_dns_name}"
}

output "certificate_arn" {
  description = "ARN of the issued ACM certificate, null when TLS is off."
  value       = one(module.acm[*].certificate_arn)
}

output "https_listener_arn" {
  description = "ARN of the ALB HTTPS listener, null when TLS is off."
  value       = module.alb.https_listener_arn
}

output "domain_fqdn" {
  description = "FQDN of the environment domain, null when TLS is off."
  value       = one(module.dns[*].apex_fqdn)
}

output "wildcard_fqdn" {
  description = "FQDN of the wildcard record used for tenant subdomains, null when TLS is off."
  value       = one(module.dns[*].wildcard_fqdn)
}

output "tenant_url_example" {
  description = "What a tenant subdomain looks like on this environment."
  value       = var.domain_name == "" ? null : "https://demo.${var.domain_name}"
}

output "db_address" {
  description = "Private hostname of the staging database."
  value       = module.rds.address
}

output "db_port" {
  description = "Port the staging database listens on."
  value       = module.rds.port
}

output "db_endpoint" {
  description = "Hostname and port of the staging database."
  value       = module.rds.endpoint
}

output "db_name" {
  description = "Name of the initial database."
  value       = module.rds.db_name
}

output "db_master_username" {
  description = "Master user name for the staging database."
  value       = module.rds.master_username
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the master credentials. RDS owns the value; read it with `aws secretsmanager get-secret-value`."
  value       = module.rds.master_user_secret_arn
}

output "db_engine_version_actual" {
  description = "Exact PostgreSQL version running."
  value       = module.rds.engine_version_actual
}

output "app_secret_arn" {
  description = "ARN of the application secret."
  value       = module.secrets.app_secret_arn
}

output "app_secret_name" {
  description = "Name of the application secret."
  value       = module.secrets.app_secret_name
}

output "app_secret_keys" {
  description = "Keys the application secret holds. Values are not tracked by Terraform."
  value       = module.secrets.app_secret_keys
}

output "cicd_role_arn" {
  description = "ARN of the GitHub Actions deploy role. Set as role-to-assume in the workflow; null when github_repo is empty."
  value       = one(module.cicd_oidc_role[*].role_arn)
}

output "cicd_allowed_subjects" {
  description = "OIDC subject claims the deploy role trusts. Compare against the workflow's claim when assume-role is denied."
  value       = try(module.cicd_oidc_role[0].allowed_subjects, [])
}

output "ecs_service_arn" {
  description = "ARN of the staging ECS service."
  value       = module.ecs.service_arn
}
