# ---------------------------------------------------------------------------
# global/dns
#
# The public hosted zone for the root domain. It is SHARED by staging and
# production, so it does not belong in either environment's state — both look
# it up by name with a data source.
#
# Apply this ONCE, before Phase 4 in any environment. Then copy the nameservers
# from the output into your domain registrar. Nothing resolves until you do.
#
# If the zone already exists (e.g. Route53 registered the domain and created it
# for you), DON'T apply this — import it instead:
#   terraform import aws_route53_zone.root <ZONE_ID>
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "charityapp-tfstate-jk7f2a9x"
    key            = "global/dns/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "charityapp-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "charityapp"
      Scope     = "global"
      ManagedBy = "Terraform"
    }
  }
}

variable "region" {
  description = "AWS region for the provider. Route53 itself is global."
  type        = string
  default     = "ap-south-1"
}

variable "root_domain" {
  description = "Root domain that both environments hang off, without a trailing dot."
  type        = string
  default     = "charity-syria.com"
}

resource "aws_route53_zone" "root" {
  name    = var.root_domain
  comment = "Public zone for CharityApp - shared by staging and production"

  # Losing this zone means every environment's DNS and ACM validation breaks,
  # and a recreated zone gets NEW nameservers you'd have to re-file with the
  # registrar.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = var.root_domain
  }
}

# --- Outputs ---------------------------------------------------------------

output "zone_id" {
  description = "Hosted zone ID. Environments look this up by name, not by wiring this value."
  value       = aws_route53_zone.root.zone_id
}

output "zone_name" {
  description = "Hosted zone name."
  value       = aws_route53_zone.root.name
}

output "nameservers" {
  description = "Set these as the domain's nameservers at the registrar. DNS is dead until you do."
  value       = aws_route53_zone.root.name_servers
}
