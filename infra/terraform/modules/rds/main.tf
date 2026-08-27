locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
  })
}

# Spans both private subnets so RDS can place the instance - and its standby
# once multi_az is on - without the network being the thing that blocks a
# failover.
resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Private subnets available to the ${var.name_prefix} database"
  subnet_ids  = var.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

resource "aws_db_parameter_group" "this" {
  # name_prefix, not name: a major version bump changes the family, which
  # replaces this group, and create_before_destroy would collide on a fixed
  # name.
  name_prefix = "${var.name_prefix}-pg-"
  description = "PostgreSQL parameters for ${var.name_prefix}"
  family      = var.parameter_group_family

  # Refuse non-TLS connections. Static parameter, so it has to be attached at
  # creation - retrofitting it costs a reboot.
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  # Log anything slower than this. -1 disables.
  parameter {
    name  = "log_min_duration_statement"
    value = tostring(var.log_min_duration_statement)
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-pg"
  })
}

resource "aws_db_instance" "this" {
  identifier = "${var.name_prefix}-db"

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.master_username

  # No password anywhere in this config, and none in Terraform state. RDS
  # generates the master credential, stores it in Secrets Manager and owns
  # rotation; everything downstream reads it by ARN.
  manage_master_user_password = true

  storage_type          = var.storage_type
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = var.security_group_ids
  # Private subnets alone don't make the instance unreachable - this is the
  # setting that keeps it off the internet.
  publicly_accessible = false
  port                = var.port

  multi_az                   = var.multi_az
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  apply_immediately          = var.apply_immediately

  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  copy_tags_to_snapshot   = true

  performance_insights_enabled    = var.performance_insights_enabled
  enabled_cloudwatch_logs_exports = var.cloudwatch_logs_exports

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"

  lifecycle {
    # The snapshot name embeds a timestamp, which would otherwise churn the
    # plan on every run.
    ignore_changes = [final_snapshot_identifier]
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db"
  })
}
