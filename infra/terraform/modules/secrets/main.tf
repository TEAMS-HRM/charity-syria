locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
  })
}

# One secret per environment holding the application's own configuration. The
# database credential is deliberately NOT in here - RDS owns that one and
# rotates it, and a second copy would drift the moment it rotated.
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app"
  description = "Application secrets for ${var.name_prefix}"

  # Staging sets 0 so a destroy really deletes it. Anything above 0 keeps the
  # NAME reserved for that many days, and recreating the environment then fails
  # with InvalidRequestException until the window expires.
  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}/app"
  })
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(var.initial_values)

  lifecycle {
    # Terraform owns the secret's existence and the SHAPE of its JSON. It does
    # not own the values: those get replaced by hand or by a rotation lambda,
    # and an apply must never overwrite a real key with a placeholder.
    ignore_changes = [secret_string]
  }
}
