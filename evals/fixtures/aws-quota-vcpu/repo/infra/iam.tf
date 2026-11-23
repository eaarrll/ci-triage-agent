data "aws_iam_policy_document" "workers_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "workers" {
  name               = "batch-reconcile-workers"
  assume_role_policy = data.aws_iam_policy_document.workers_assume.json
}

resource "aws_iam_role_policy_attachment" "workers_ssm" {
  role       = aws_iam_role.workers.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "workers_ecr" {
  role       = aws_iam_role.workers.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "workers_queue" {
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]
    resources = [data.aws_sqs_queue.reconcile.arn]
  }
}

resource "aws_iam_role_policy" "workers_queue" {
  name   = "reconcile-queue"
  role   = aws_iam_role.workers.id
  policy = data.aws_iam_policy_document.workers_queue.json
}

resource "aws_iam_instance_profile" "workers" {
  name = "batch-reconcile-workers"
  role = aws_iam_role.workers.name
}
