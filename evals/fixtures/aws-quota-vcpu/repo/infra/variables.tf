variable "region" {
  type    = string
  default = "us-east-1"
}

variable "job_image" {
  type        = string
  description = "Container image the workers run."
  default     = "444455556666.dkr.ecr.us-east-1.amazonaws.com/batch-reconcile:2026.11.3"
}
