# global/github-oidc
#
# The GitHub OIDC provider is account-wide: exactly one can exist per AWS
# account, so it cannot live in staging's state or production's - they would
# fight over it. Same reasoning as global/dns and the hosted zone.
#
# Apply this once, before either environment's cicd_oidc_role module.

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
    key            = "global/github-oidc/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "charityapp-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "charityapp"
      Scope     = "global"
      ManagedBy = "Terraform"
    }
  }
}

variable "aws_region" {
  description = "Region the provider talks to. IAM itself is global."
  type        = string
  default     = "ap-south-1"
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  # The audience GitHub requests when a workflow asks for a token.
  client_id_list = ["sts.amazonaws.com"]

  # AWS validates GitHub's certificate against its own trust store now, so this
  # value is no longer load-bearing - but the API still requires the field.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  # Destroying this breaks every GitHub pipeline in the account at once, and it
  # is shared with anything else deploying from GitHub.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "github-actions-oidc"
  }
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider. Environments look it up by URL with a data source rather than reading this output."
  value       = aws_iam_openid_connect_provider.github.arn
}
