data "aws_vpc" "batch" {
  tags = {
    Name = "batch-prod"
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.batch.id]
  }

  tags = {
    Tier = "private"
  }
}

data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_sqs_queue" "reconcile" {
  name = "batch-reconcile"
}

data "aws_sns_topic" "oncall" {
  name = "batch-oncall"
}

resource "aws_security_group" "workers" {
  name        = "batch-reconcile-workers"
  description = "Reconcile workers: egress only"
  vpc_id      = data.aws_vpc.batch.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
