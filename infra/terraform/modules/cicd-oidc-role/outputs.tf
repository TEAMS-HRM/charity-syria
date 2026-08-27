output "role_arn" {
  description = "ARN of the deploy role. Set this as role-to-assume in the GitHub Actions workflow."
  value       = aws_iam_role.deploy.arn
}

output "role_name" {
  description = "Name of the deploy role."
  value       = aws_iam_role.deploy.name
}

output "allowed_subjects" {
  description = "Exact OIDC subject claims the role trusts. If a workflow gets AccessDenied on assume-role, compare its claim against this list."
  value       = local.allowed_subjects
}
