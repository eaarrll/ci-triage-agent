terraform {
  required_version = ">= 1.13"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.22"
    }
  }

  backend "s3" {
    bucket       = "acme-terraform-state-123456789012"
    key          = "storefront/staging.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = {
      service     = "storefront"
      environment = var.environment
    }
  }
}

data "aws_caller_identity" "current" {}
