output "alb_arn" {
  description = "ARN of the application load balancer."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the application load balancer."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Route53 hosted zone ID of the load balancer, used by alias records."
  value       = aws_lb.this.zone_id
}

output "target_group_arn" {
  description = "ARN of the target group the ECS service registers into."
  value       = aws_lb_target_group.this.arn
}

output "http_listener_arn" {
  description = "ARN of the HTTP listener."
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener, null when no certificate was supplied."
  value       = one(aws_lb_listener.https[*].arn)
}

output "tls_enabled" {
  description = "Whether the load balancer terminates TLS."
  value       = var.enable_https
}
