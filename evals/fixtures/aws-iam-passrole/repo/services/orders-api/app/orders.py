from fastapi import APIRouter, HTTPException

from app import store

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/{order_id}")
async def get_order(order_id: str) -> dict:
    order = await store.get_order(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    return order


@router.post("/{order_id}/cancel", status_code=202)
async def cancel_order(order_id: str) -> dict:
    if not await store.request_cancellation(order_id):
        raise HTTPException(status_code=409, detail="order can no longer be cancelled")
    return {"order_id": order_id, "status": "cancellation_requested"}
