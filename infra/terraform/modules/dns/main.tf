# ---------------------------------------------------------------------------
# modules/dns
#
# Alias records pointing an environment's domain at its load balancer.
#
# The wildcard is what makes per-tenant subdomains work: every
# <tenant>.<domain> resolves to the same ALB, and the app routes on the Host
# header. No DNS change is needed when a tenant signs up.
#
# Alias (not CNAME) records are used because a CNAME cannot live at a zone apex
# and alias lookups are free.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "apex" {
  count = var.create_apex_record ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "wildcard" {
  count = var.create_wildcard_record ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = "*.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
