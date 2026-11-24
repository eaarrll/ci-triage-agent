# Customer-managed key for the assets bucket (SEC-112: no AWS-managed encryption for
# customer-facing buckets).
resource "aws_kms_key" "assets" {
  description             = "storefront assets (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.assets_key.json
}

resource "aws_kms_alias" "assets" {
  name          = "alias/storefront-assets-${var.environment}"
  target_key_id = aws_kms_key.assets.key_id
}

data "aws_iam_policy_document" "assets_key" {
  # Lets IAM policies in this account grant use of the key.
  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # CloudFront must decrypt objects it serves through the origin access control.
  statement {
    sid       = "CloudFrontDecrypt"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.assets.arn]
    }
  }
}
