output "certificate_arn" {
  description = "ARN of the ISSUED certificate. Reading this forces callers to wait for validation."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "certificate_domain_name" {
  description = "Primary domain on the certificate."
  value       = aws_acm_certificate.this.domain_name
}

output "certificate_status" {
  description = "Certificate status reported by ACM."
  value       = aws_acm_certificate.this.status
}

output "validation_record_fqdns" {
  description = "FQDNs of the DNS validation records, useful when debugging a stuck validation."
  value       = [for record in aws_route53_record.validation : record.fqdn]
}
