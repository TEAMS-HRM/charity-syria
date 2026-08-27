variable "hosted_zone_id" {
  description = "Route53 zone ID the records are created in."
  type        = string
}

variable "domain_name" {
  description = "Domain the environment answers on, e.g. staging.charity-syria.com."
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the load balancer the records alias to."
  type        = string
}

variable "alb_zone_id" {
  description = "Route53 hosted zone ID of the load balancer (from the ALB, not the domain)."
  type        = string
}

variable "create_apex_record" {
  description = "Whether to create the record for the domain itself."
  type        = bool
  default     = true
}

variable "create_wildcard_record" {
  description = "Whether to create the *.<domain> record used for per-tenant subdomains."
  type        = bool
  default     = true
}
