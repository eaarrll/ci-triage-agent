resource "aws_cloudwatch_metric_alarm" "queue_backlog" {
  alarm_name          = "batch-reconcile-queue-backlog"
  alarm_description   = "The reconcile queue is not draining."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 6
  threshold           = 20000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.oncall.arn]

  dimensions = {
    QueueName = data.aws_sqs_queue.reconcile.name
  }
}

resource "aws_cloudwatch_metric_alarm" "oldest_message" {
  alarm_name          = "batch-reconcile-oldest-message"
  alarm_description   = "Reconcile work items are waiting for more than six hours."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 21600
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.oncall.arn]

  dimensions = {
    QueueName = data.aws_sqs_queue.reconcile.name
  }
}
