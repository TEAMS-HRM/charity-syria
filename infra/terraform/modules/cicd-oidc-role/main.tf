locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
  })

  # GitHub mints a token whose `sub` claim describes what is running. A job
  # pinned to a GitHub Environment gets `...:environment:staging`; one that is
  # not gets `...:ref:refs/heads/main`. The role trusts only the exact strings
  # listed here, so a fork or a feature branch cannot assume it.
  subject_refs = [
    for ref in var.allowed_refs : "repo:${var.github_org}/${var.github_repo}:ref:${ref}"
  ]
  subject_environments = [
    for env in var.allowed_environments : "repo:${var.github_org}/${var.github_repo}:environment:${env}"
  ]
  allowed_subjects = concat(local.subject_refs, local.subject_environments)
}

# Created once in global/github-oidc. Looked up rather than owned, so both
# environments can build roles against the same provider.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # StringEquals, not StringLike: no wildcards, so `repo:org/repo:*` - which
    # would let any branch in the repo deploy to production - is impossible.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.allowed_subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  description          = "Assumed by GitHub Actions to deploy ${var.github_org}/${var.github_repo}"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = var.max_session_duration

  tags = merge(local.common_tags, {
    Name = var.role_name
  })
}

data "aws_iam_policy_document" "deploy" {
  # Getting an ECR token is account-wide by design: the API takes no resource.
  # The push permissions below are what actually constrain this.
  statement {
    sid       = "ECRAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [var.ecr_repository_arn]
  }

  # RegisterTaskDefinition and DescribeTaskDefinition have no resource-level
  # permissions in IAM - AWS accepts only "*". The PassRole limit below is what
  # stops a rogue task definition being registered against arbitrary roles.
  statement {
    sid    = "ECSTaskDefinitions"
    effect = "Allow"
    actions = [
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ECSDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = [var.ecs_service_arn]
  }

  # Task ARNs are generated per run, so they cannot be enumerated ahead of time.
  # Scoped to the one cluster instead.
  statement {
    sid    = "ECSInspectTasks"
    effect = "Allow"
    actions = [
      "ecs:ListTasks",
      "ecs:DescribeTasks",
    ]
    resources = ["*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.ecs_cluster_arn]
    }
  }

  # Registering a task definition means handing ECS a role to run as. Without
  # this scoped to exactly the two task roles, the deploy role could mint a task
  # running as anything in the account - a privilege escalation path.
  statement {
    sid       = "PassTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = var.passable_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.role_name}-policy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
