variable "name_prefix" {
  description = "Prefix applied to ECS resource names."
  type        = string
}

variable "container_name" {
  description = "Name of the application container in the task definition."
  type        = string
  default     = "app"
}

variable "container_image" {
  description = "Fully qualified image URI the task runs, including tag."
  type        = string
}

variable "container_port" {
  description = "Port the application container listens on."
  type        = number
  default     = 8080
}

variable "task_cpu" {
  description = "CPU units reserved for the task (1024 = 1 vCPU)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory in MiB reserved for the task."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of tasks the service keeps running."
  type        = number
  default     = 1
}

variable "private_subnet_ids" {
  description = "IDs of the private subnets the tasks run in."
  type        = list(string)
}

variable "security_group_ids" {
  description = "IDs of the security groups attached to the tasks."
  type        = list(string)
}

variable "target_group_arn" {
  description = "ARN of the load balancer target group tasks register into."
  type        = string
}

variable "health_check_grace_period" {
  description = "Seconds the service ignores load balancer health checks after a task starts."
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "Days CloudWatch retains container logs."
  type        = number
  default     = 30
}

variable "environment_variables" {
  description = "Plain-text environment variables passed to the container."
  type        = map(string)
  default     = {}
}

variable "enable_execute_command" {
  description = "Whether ECS Exec is enabled for shell access into running tasks."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}

variable "aws_region" {
  description = "Region used for the container log configuration. Passed in rather than read from a data source so nothing in this module is unknown at plan time."
  type        = string
}

variable "secrets" {
  description = "Secret environment variables, mapping the variable name to a Secrets Manager or SSM valueFrom ARN. Append :<json-key>:: to pull one field out of a JSON secret."
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "ARNs of the secrets the task execution role may read, without any JSON key suffix. Usually the bare ARNs behind var.secrets."
  type        = list(string)
  default     = []
}
