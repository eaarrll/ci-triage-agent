output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.assets.id
}

output "assets_kms_key_arn" {
  value = aws_kms_key.assets.arn
}
