output "alb_security_group_id" {
  description = "ID of the load balancer security group."
  value       = aws_security_group.alb.id
}

output "fargate_security_group_id" {
  description = "ID of the Fargate service security group."
  value       = aws_security_group.fargate.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group."
  value       = aws_security_group.rds.id
}