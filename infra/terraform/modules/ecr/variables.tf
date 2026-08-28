variable "repository_name" {
  description = "Name of the ECR repository."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]+(?:[._/-][a-z0-9]+)*$", var.repository_name))
    error_message = "repository_name must be a valid ECR repository name."
  }
}

variable "tags" {
  description = "Additional tags to apply to the ECR repository."
  type        = map(string)
  default     = {}
}

variable "force_delete" {
  description = "Whether destroying the repository also deletes the images inside it. AWS refuses to delete a non-empty repository otherwise, so disposable environments set this true."
  type        = bool
  default     = false
}
