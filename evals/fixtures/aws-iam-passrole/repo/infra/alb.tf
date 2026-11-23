data "aws_lb" "public" {
  name = "public-production"
}

data "aws_lb_listener" "https" {
  load_balancer_arn = data.aws_lb.public.arn
  port              = 443
}

resource "aws_security_group" "orders_api" {
  name        = "orders-api"
  description = "orders-api tasks"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description     = "HTTP from the public load balancer"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = tolist(data.aws_lb.public.security_groups)
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb_target_group" "orders_api" {
  name        = "orders-api"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.main.id

  health_check {
    path                = "/healthz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
  }

  deregistration_delay = 30
}

resource "aws_lb_listener_rule" "orders_api" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 120

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.orders_api.arn
  }

  condition {
    host_header {
      values = ["orders.example.com"]
    }
  }
}
