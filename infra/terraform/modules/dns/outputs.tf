output "apex_fqdn" {
  description = "FQDN of the record for the domain itself, null when not created."
  value       = one(aws_route53_record.apex[*].fqdn)
}

output "wildcard_fqdn" {
  description = "FQDN of the wildcard record, null when not created."
  value       = one(aws_route53_record.wildcard[*].fqdn)
}
