terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "example-org-orders-tfstate"
    key          = "orders-platform/production.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = {
      Service    = "orders"
      ManagedBy  = "terraform"
      Repository = "example-org/orders-platform"
    }
  }
}
