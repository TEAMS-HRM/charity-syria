variable "name_prefix" {
  description = "Prefix applied to secret names."
  type        = string
}

variable "initial_values" {
  description = "Keys the secret is created with, and the placeholder values written once at creation. Later applies never touch the values - only a human or a rotation lambda does."
  type        = map(string)
  default     = {}
}

variable "recovery_window_in_days" {
  description = "Days a deleted secret is recoverable. 0 deletes immediately, which is what a disposable environment wants: any higher value reserves the name and blocks recreating the environment until it expires."
  type        = number
  default     = 7

  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "recovery_window_in_days must be 0, or between 7 and 30."
  }
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
