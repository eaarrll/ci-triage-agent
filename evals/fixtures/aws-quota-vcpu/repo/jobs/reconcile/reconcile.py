"""Reconciles ledger partitions against settlement files, one SQS work item per partition."""

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import boto3
import yaml

from jobs.reconcile.ledger import reconcile_partition

log = logging.getLogger("reconcile")


def main() -> None:
    with open(os.path.join(os.path.dirname(__file__), "config.yaml")) as fh:
        config = yaml.safe_load(fh)
    sqs = boto3.client("sqs", region_name=os.environ["AWS_REGION"])
    queue_url = os.environ["QUEUE_URL"]
    threads = int(os.environ.get("WORKER_THREADS", "4"))

    with ThreadPoolExecutor(max_workers=threads) as pool:
        while True:
            batch = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=config["batch_size"],
                WaitTimeSeconds=20,
                VisibilityTimeout=config["visibility_timeout_seconds"],
            ).get("Messages", [])
            for message in batch:
                pool.submit(handle, sqs, queue_url, message)


def handle(sqs, queue_url: str, message: dict) -> None:
    item = json.loads(message["Body"])
    reconcile_partition(item["partition"], item["business_date"])
    sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=message["ReceiptHandle"])
    log.info("reconciled partition %s for %s", item["partition"], item["business_date"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
