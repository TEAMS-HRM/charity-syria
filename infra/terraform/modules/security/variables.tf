variable "name_prefix" {
  description = "Prefix applied to security group names."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC where security groups are created."
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
variable "container_port" {
  description = "Port the application container listens on, allowed inbound from the ALB."
  type        = number
  default     = 8080
}
