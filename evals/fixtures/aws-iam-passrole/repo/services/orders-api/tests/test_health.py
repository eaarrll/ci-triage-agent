from fastapi.testclient import TestClient


def test_healthz(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://orders@localhost/orders")
    monkeypatch.setenv("ORDER_EVENTS_QUEUE_URL", "https://sqs.eu-west-1.amazonaws.com/123456789012/order-events")
    from app.main import app

    assert TestClient(app).get("/healthz").json() == {"status": "ok"}
