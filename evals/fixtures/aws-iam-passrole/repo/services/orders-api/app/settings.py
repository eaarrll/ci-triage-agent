from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    order_events_queue_url: str
    log_level: str = "info"
