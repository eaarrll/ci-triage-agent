resource "aws_launch_template" "workers" {
  name                   = "batch-reconcile-workers"
  image_id               = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = "c6i.4xlarge"
  update_default_version = true

  iam_instance_profile {
    arn = aws_iam_instance_profile.workers.arn
  }

  vpc_security_group_ids = [aws_security_group.workers.id]

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size = 100
      volume_type = "gp3"
      encrypted   = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/templates/worker-init.sh.tftpl", {
    image     = var.job_image
    queue_url = data.aws_sqs_queue.reconcile.url
    region    = var.region
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "batch-reconcile-worker"
    }
  }
}

resource "aws_autoscaling_group" "workers" {
  name                      = "batch-reconcile-workers"
  vpc_zone_identifier       = data.aws_subnets.private.ids
  min_size                  = 0
  max_size                  = 16
  desired_capacity          = 12
  health_check_type         = "EC2"
  health_check_grace_period = 120
  default_instance_warmup   = 120

  launch_template {
    id      = aws_launch_template.workers.id
    version = aws_launch_template.workers.latest_version
  }

  tag {
    key                 = "Service"
    value               = "batch-reconcile"
    propagate_at_launch = true
  }
}
