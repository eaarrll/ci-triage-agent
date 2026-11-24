data "aws_iam_policy_document" "github_oidc" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:example-org/storefront-web:ref:refs/heads/main"]
    }
  }
}

# Role used by the publish-assets and invalidate-cdn jobs.
resource "aws_iam_role" "deploy" {
  name               = "storefront-deploy-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.github_oidc.json
}

data "aws_iam_policy_document" "deploy_assets" {
  statement {
    sid       = "ListAssets"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.assets.arn]
  }

  statement {
    sid       = "WriteAssets"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }

  statement {
    sid       = "InvalidateCdn"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.assets.arn]
  }
}

resource "aws_iam_role_policy" "deploy_assets" {
  name   = "deploy-assets"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_assets.json
}
