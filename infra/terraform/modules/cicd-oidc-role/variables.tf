variable "github_org" {
  description = "GitHub organisation or user that owns the repository."
  type        = string
}

variable "github_repo" {
  description = "Repository allowed to assume this role."
  type        = string
}

variable "github_org_id" {
  description = "Numeric GitHub id of the org/user. Needed for the immutable subject form; find it at https://api.github.com/users/<org>. Empty trusts only the classic name-based form."
  type        = string
  default     = ""
}

variable "github_repo_id" {
  description = "Numeric GitHub id of the repository. Find it at https://api.github.com/repos/<org>/<repo>. Empty trusts only the classic name-based form."
  type        = string
  default     = ""
}

variable "allowed_refs" {
  description = "Git refs allowed to assume the role, e.g. refs/heads/main. Use this for jobs that are NOT pinned to a GitHub Environment."
  type        = list(string)
  default     = []
}

variable "allowed_environments" {
  description = "GitHub Environments allowed to assume the role. A job with `environment: production` presents this form instead of a ref, and it is what makes the approval gate meaningful."
  type        = list(string)
  default     = []
}

variable "role_name" {
  description = "Name of the deploy role."
  type        = string
}

variable "ecr_repository_arn" {
  description = "ARN of the ECR repository the pipeline may push to."
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster the pipeline may inspect tasks in."
  type        = string
}

variable "ecs_service_arn" {
  description = "ARN of the ECS service the pipeline may update."
  type        = string
}

variable "passable_role_arns" {
  description = "Task role ARNs the pipeline may hand to ECS. Normally the task execution role and the task role, and nothing else."
  type        = list(string)
}

variable "max_session_duration" {
  description = "Seconds an assumed session lasts. A deploy takes minutes, so the one-hour default is already generous."
  type        = number
  default     = 3600
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
