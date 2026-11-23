terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "example-org-batch-tfstate"
    key          = "batch-jobs/prod.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Service    = "batch-jobs"
      ManagedBy  = "terraform"
      Repository = "example-org/batch-jobs"
    }
  }
}
