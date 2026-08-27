output "app_secret_arn" {
  description = "ARN of the application secret. Feed this to the ECS module's secret_arns so the execution role may read it."
  value       = aws_secretsmanager_secret.app.arn
}

output "app_secret_name" {
  description = "Name of the application secret, for `aws secretsmanager put-secret-value --secret-id`."
  value       = aws_secretsmanager_secret.app.name
}

output "app_secret_keys" {
  description = "Keys the secret was created with. The values are not exposed - Terraform stops tracking them after creation."
  value       = sort(keys(var.initial_values))
}
