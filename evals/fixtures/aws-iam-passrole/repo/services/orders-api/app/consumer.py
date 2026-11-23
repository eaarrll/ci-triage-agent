import asyncio
import json
import logging

import boto3

from app import fulfilment

logger = logging.getLogger(__name__)


class OrderEventConsumer:
    """Long-polls the order-events queue and applies each event to its order."""

    def __init__(self, queue_url: str, *, batch_size: int = 10, client=None) -> None:
        self._queue_url = queue_url
        self._batch_size = batch_size
        self._sqs = client or boto3.client("sqs")
        self._stopping = asyncio.Event()

    def stop(self) -> None:
        self._stopping.set()

    async def run(self) -> None:
        while not self._stopping.is_set():
            response = await asyncio.to_thread(
                self._sqs.receive_message,
                QueueUrl=self._queue_url,
                MaxNumberOfMessages=self._batch_size,
                WaitTimeSeconds=20,
            )
            for message in response.get("Messages", []):
                await self._handle(message)

    async def _handle(self, message: dict) -> None:
        event = json.loads(message["Body"])
        try:
            await fulfilment.apply_event(event)
        except fulfilment.UnknownOrder:
            logger.warning("dropping event for unknown order %s", event.get("order_id"))
        await asyncio.to_thread(
            self._sqs.delete_message,
            QueueUrl=self._queue_url,
            ReceiptHandle=message["ReceiptHandle"],
        )
