locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
  })
}

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = var.public_subnet_ids
  security_groups    = var.security_group_ids

  drop_invalid_header_fields = true
  enable_deletion_protection = var.enable_deletion_protection

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-alb"
  })
}

# Targets are registered by IP because Fargate tasks run in awsvpc mode.
resource "aws_lb_target_group" "this" {
  name        = "${var.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  deregistration_delay = var.deregistration_delay

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.healthy_threshold
    unhealthy_threshold = var.unhealthy_threshold
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-tg"
  })
}

# Port 80 behaviour depends on whether TLS is enabled:
#   enable_https = false (pre-Phase 4) -> forward to the target group, so the
#                                        container can be proven over plain HTTP
#   enable_https = true  (Phase 4 on)  -> 301 redirect to HTTPS, terminated below
# Keeping one listener resource means flipping TLS on modifies it in place
# instead of tearing the listener down and standing it back up.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https ? [] : [1]

    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.this.arn
    }
  }

  dynamic "default_action" {
    for_each = var.enable_https ? [1] : []

    content {
      type = "redirect"

      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-http-listener"
  })
}

# TLS termination. The certificate covers the environment domain and its
# wildcard, so every tenant subdomain lands on this one listener.
resource "aws_lb_listener" "https" {
  count = var.enable_https ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-https-listener"
  })
}
