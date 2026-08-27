# ---------------------------------------------------------------------------
# global/bootstrap
#
# Creates the S3 bucket + DynamoDB table that hold Terraform remote state and
# locking for EVERY other environment (staging, production).
#
# CHICKEN-AND-EGG: this module uses LOCAL state (there's no remote backend yet
# to store it in). You apply it ONCE, manually, before anything else. After it
# exists, all other environments point their backend at the bucket/table below.
#
# Run this while assumed into the CharityApp account (profile charityapp-admin).
#
# >>> BEFORE YOU RUN: change `state_bucket_name` default below to something
#     globally unique (replace CHANGE-ME with random characters). <<<
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # NOTE: intentionally NO backend block here — bootstrap uses local state.
}

provider "aws" {
  region = var.region
  # Uses whatever profile is set via $env:AWS_PROFILE (e.g. charityapp-admin).
  # You can also uncomment the next line to pin it explicitly:
  # profile = "charityapp-admin"
}

# --- Variables -------------------------------------------------------------

variable "region" {
  description = "AWS region for the state bucket and lock table."
  type        = string
  default     = "ap-south-1" # Mumbai
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform state."
  type        = string
  # S3 bucket names are globally unique across ALL of AWS — include random
  # characters to avoid clashes. CHANGE THIS before running.
  default = "charityapp-tfstate-jk7f2a9x"
}

variable "lock_table_name" {
  description = "DynamoDB table for Terraform state locking."
  type        = string
  default     = "charityapp-tf-locks"
}

# --- State bucket ----------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name

  # Safety: state is precious. Prevent accidental destroy of this bucket.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning: keep history of state files so you can recover from a bad apply.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypt state at rest (contains secrets like DB endpoints, sometimes creds).
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Block ALL public access — state must never be public.
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Lock table ------------------------------------------------------------
# DynamoDB provides state locking so two applies can't corrupt state at once.

resource "aws_dynamodb_table" "locks" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST" # cheap; you lock rarely
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# --- Outputs ---------------------------------------------------------------
# Copy these into each environment's backend.tf (see backend.hcl.example).

output "state_bucket" {
  value       = aws_s3_bucket.state.id
  description = "Use as `bucket` in other environments' backend config."
}

output "lock_table" {
  value       = aws_dynamodb_table.locks.name
  description = "Use as `dynamodb_table` in other environments' backend config."
}

output "region" {
  value = var.region
}
