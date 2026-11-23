import json

import boto3
import pytest
from moto import mock_aws

from app import fulfilment
from app.consumer import OrderEventConsumer


@pytest.fixture
def sqs():
    with mock_aws():
        client = boto3.client("sqs", region_name="eu-west-1")
        url = client.create_queue(QueueName="order-events")["QueueUrl"]
        yield client, url


async def test_handled_messages_are_deleted(sqs, monkeypatch):
    client, url = sqs
    applied = []

    async def fake_apply(event):
        applied.append(event["order_id"])

    monkeypatch.setattr(fulfilment, "apply_event", fake_apply)
    body = {"order_id": "ord_123", "status": "shipped", "occurred_at": "2026-11-18T10:00:00Z"}
    client.send_message(QueueUrl=url, MessageBody=json.dumps(body))
    message = client.receive_message(QueueUrl=url)["Messages"][0]

    await OrderEventConsumer(url, client=client)._handle(message)

    assert applied == ["ord_123"]
    attributes = client.get_queue_attributes(
        QueueUrl=url, AttributeNames=["ApproximateNumberOfMessagesNotVisible"]
    )["Attributes"]
    assert attributes["ApproximateNumberOfMessagesNotVisible"] == "0"


async def test_unknown_orders_are_dropped(sqs, monkeypatch):
    client, url = sqs

    async def unknown(event):
        raise fulfilment.UnknownOrder(event["order_id"])

    monkeypatch.setattr(fulfilment, "apply_event", unknown)
    client.send_message(QueueUrl=url, MessageBody=json.dumps({"order_id": "ord_missing"}))
    message = client.receive_message(QueueUrl=url)["Messages"][0]

    await OrderEventConsumer(url, client=client)._handle(message)
