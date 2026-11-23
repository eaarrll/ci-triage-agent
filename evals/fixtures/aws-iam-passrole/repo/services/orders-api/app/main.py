import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import orders
from app.consumer import OrderEventConsumer
from app.settings import Settings

settings = Settings()
logging.basicConfig(level=settings.log_level.upper())


@asynccontextmanager
async def lifespan(app: FastAPI):
    consumer = OrderEventConsumer(settings.order_events_queue_url)
    task = asyncio.create_task(consumer.run())
    yield
    consumer.stop()
    await task


app = FastAPI(title="orders-api", lifespan=lifespan)
app.include_router(orders.router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
