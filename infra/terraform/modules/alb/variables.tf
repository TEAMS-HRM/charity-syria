variable "name_prefix" {
  description = "Prefix applied to load balancer resource names."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC where the target group is created."
  type        = string
}

variable "public_subnet_ids" {
  description = "IDs of the public subnets the load balancer is placed in."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "public_subnet_ids must contain at least two subnets in distinct availability zones."
  }
}

variable "security_group_ids" {
  description = "IDs of the security groups attached to the load balancer."
  type        = list(string)
}

variable "container_port" {
  description = "Port the application container listens on."
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "Path the target group probes for container health."
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Seconds between target group health checks."
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Seconds to wait for a health check response before it counts as failed."
  type        = number
  default     = 5
}

variable "healthy_threshold" {
  description = "Consecutive successful checks before a target is considered healthy."
  type        = number
  default     = 2
}

variable "unhealthy_threshold" {
  description = "Consecutive failed checks before a target is considered unhealthy."
  type        = number
  default     = 3
}

variable "deregistration_delay" {
  description = "Seconds the load balancer waits before deregistering a target."
  type        = number
  default     = 30
}

variable "enable_deletion_protection" {
  description = "Whether the load balancer is protected from accidental deletion."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener. Null keeps the ALB on plain HTTP (pre-Phase 4)."
  type        = string
  default     = null
}

variable "ssl_policy" {
  description = "ELB security policy for the HTTPS listener. The default allows TLS 1.2 and 1.3 only."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

# Gating the HTTPS listener on the certificate ARN does not work: the ARN is
# unknown until apply, and Terraform must resolve `count` at plan time. This
# flag is derived from configuration instead, so it is always known.
variable "enable_https" {
  description = "Whether to create the HTTPS listener and redirect port 80 to it. Requires certificate_arn."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_https == false || var.certificate_arn != null
    error_message = "certificate_arn must be set when enable_https is true."
  }
}
