data "aws_iam_role" "execution" {
  name = "orders-api-execution"
}

resource "aws_cloudwatch_log_group" "orders_api" {
  name              = local.log_group
  retention_in_days = 30
}

data "aws_iam_policy_document" "orders_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:ecs:${local.region}:${local.account_id}:*"]
    }
  }
}

resource "aws_iam_role" "orders_task" {
  name               = "orders-task-role"
  assume_role_policy = data.aws_iam_policy_document.orders_task_assume.json
}

data "aws_iam_policy_document" "orders_task_sqs" {
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.order_events.arn]
  }
}

resource "aws_iam_role_policy" "orders_task_sqs" {
  name   = "orders-task-sqs"
  role   = aws_iam_role.orders_task.id
  policy = data.aws_iam_policy_document.orders_task_sqs.json
}

resource "aws_ecs_task_definition" "orders_api" {
  family                   = "orders-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = data.aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.orders_task.arn
  skip_destroy             = true

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "orders-api"
      image     = var.image
      essential = true
      portMappings = [
        { containerPort = 8080, protocol = "tcp" }
      ]
      environment = [
        { name = "LOG_LEVEL", value = "info" },
        { name = "ORDER_EVENTS_QUEUE_URL", value = aws_sqs_queue.order_events.url },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/orders/prod/database-url" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.log_group
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "orders-api"
        }
      }
      healthCheck = {
        command  = ["CMD-SHELL", "curl -fsS http://localhost:8080/healthz || exit 1"]
        interval = 15
        timeout  = 5
        retries  = 3
      }
    }
  ])
}

resource "aws_ecs_service" "orders_api" {
  name                              = "orders-api"
  cluster                           = data.aws_ecs_cluster.main.arn
  task_definition                   = aws_ecs_task_definition.orders_api.arn
  desired_count                     = 3
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 30

  network_configuration {
    subnets         = data.aws_subnets.private.ids
    security_groups = [aws_security_group.orders_api.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.orders_api.arn
    container_name   = "orders-api"
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
