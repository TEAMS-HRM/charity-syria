variable "name_prefix" {
  description = "Prefix applied to database resource names."
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of the private subnets the database may be placed in. Needs at least two, in different AZs."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "RDS requires a subnet group spanning at least two availability zones."
  }
}

variable "security_group_ids" {
  description = "IDs of the security groups attached to the database."
  type        = list(string)
}

variable "db_name" {
  description = "Name of the initial database created inside the instance."
  type        = string
  default     = "charityapp"
}

variable "master_username" {
  description = "Master user name. The password is generated and held by RDS in Secrets Manager, never set here."
  type        = string
  default     = "charityapp_admin"
}

variable "port" {
  description = "Port PostgreSQL listens on. The RDS security group opens 5432, so changing this means changing that rule too."
  type        = number
  default     = 5432
}

variable "engine_version" {
  description = "PostgreSQL version. A major version alone (e.g. \"16\") tracks the latest minor of that major."
  type        = string
  default     = "16"
}

variable "parameter_group_family" {
  description = "Parameter group family. Must match the major version in engine_version."
  type        = string
  default     = "postgres16"
}

variable "instance_class" {
  description = "Instance size, e.g. db.t4g.micro for staging, db.t4g.medium for production."
  type        = string
  default     = "db.t4g.micro"
}

variable "storage_type" {
  description = "EBS volume type backing the database."
  type        = string
  default     = "gp3"
}

variable "allocated_storage" {
  description = "Storage in GiB provisioned at creation."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Upper bound in GiB for storage autoscaling. Set equal to allocated_storage to disable it."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Whether to run a standby in the second AZ. Off for staging, on for production."
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Days of automated backups retained. 0 disables backups entirely."
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Daily UTC window for automated backups, HH:MM-HH:MM."
  type        = string
  default     = "18:00-19:00"
}

variable "maintenance_window" {
  description = "Weekly UTC window for maintenance, ddd:HH:MM-ddd:HH:MM. Must not overlap backup_window."
  type        = string
  default     = "sun:19:30-sun:20:30"
}

variable "auto_minor_version_upgrade" {
  description = "Whether AWS may apply minor version upgrades during the maintenance window."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Whether modifications skip the maintenance window. Some changes cause a restart when true."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "Whether Performance Insights is on. Not supported on the smallest instance classes, so off by default."
  type        = bool
  default     = false
}

variable "cloudwatch_logs_exports" {
  description = "PostgreSQL log types shipped to CloudWatch Logs."
  type        = list(string)
  default     = ["postgresql", "upgrade"]
}

variable "log_min_duration_statement" {
  description = "Milliseconds above which a statement is logged. -1 disables slow query logging."
  type        = number
  default     = 1000
}

variable "deletion_protection" {
  description = "Whether AWS refuses to delete the instance. Off for staging, on for production."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Whether destroying the instance skips the final snapshot. True for staging, false for production."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
