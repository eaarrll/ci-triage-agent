from app import store


class UnknownOrder(Exception):
    pass


async def apply_event(event: dict) -> None:
    """Moves an order to the status carried by a warehouse or carrier event."""
    order_id = event["order_id"]
    if not await store.set_status(order_id, event["status"], at=event["occurred_at"]):
        raise UnknownOrder(order_id)
