output "instance_identifier" {
  description = "Identifier of the database instance."
  value       = aws_db_instance.this.identifier
}

output "instance_arn" {
  description = "ARN of the database instance."
  value       = aws_db_instance.this.arn
}

output "address" {
  description = "Hostname of the database. Resolves to a private address only."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Port the database listens on."
  value       = aws_db_instance.this.port
}

output "endpoint" {
  description = "Hostname and port of the database, colon separated."
  value       = aws_db_instance.this.endpoint
}

output "db_name" {
  description = "Name of the initial database."
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master user name."
  value       = aws_db_instance.this.username
}

output "master_user_secret_arn" {
  description = "ARN of the RDS-managed Secrets Manager secret holding the master credentials as {username, password}."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "master_user_secret_kms_key_id" {
  description = "KMS key encrypting the master credentials secret."
  value       = aws_db_instance.this.master_user_secret[0].kms_key_id
}

output "subnet_group_name" {
  description = "Name of the DB subnet group."
  value       = aws_db_subnet_group.this.name
}

output "parameter_group_name" {
  description = "Name of the DB parameter group."
  value       = aws_db_parameter_group.this.name
}

output "engine_version_actual" {
  description = "Exact engine version running, which engine_version may only prefix."
  value       = aws_db_instance.this.engine_version_actual
}
