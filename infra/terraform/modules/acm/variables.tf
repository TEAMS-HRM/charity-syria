variable "name_prefix" {
  description = "Prefix applied to certificate resource names and tags."
  type        = string
}

variable "domain_name" {
  description = "Primary domain on the certificate, e.g. staging.charity-syria.com."
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional names on the certificate, e.g. [\"*.staging.charity-syria.com\"]."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route53 zone ID that the DNS validation records are written into."
  type        = string
}

variable "validation_timeout" {
  description = "How long to wait for ACM to validate and issue the certificate."
  type        = string
  default     = "10m"
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
