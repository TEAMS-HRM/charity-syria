# ---------------------------------------------------------------------------
# modules/acm
#
# DNS-validated certificate for an environment's domain plus its wildcard.
#
# Kept separate from modules/dns on purpose: the ALB listener needs the
# certificate ARN as an INPUT, while the alias records need the ALB's DNS name
# as an input. Splitting the two keeps that ordering one-directional:
#   acm -> alb -> dns
# ---------------------------------------------------------------------------

locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
  })
}

resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  # A cert in use by a listener cannot be deleted, so any change that forces
  # replacement must stand up the new cert first.
  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cert"
  })
}

# One validation record per distinct name in the cert. The apex and its wildcard
# resolve to the SAME validation record, so `allow_overwrite` is required —
# without it the second write fails with "RRSet already exists".
resource "aws_route53_record" "validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until ACM has seen the records and issued the cert. Downstream
# consumers read the ARN from HERE, not from the certificate resource, so the
# ALB listener is never handed a still-pending cert.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]

  timeouts {
    create = var.validation_timeout
  }
}
