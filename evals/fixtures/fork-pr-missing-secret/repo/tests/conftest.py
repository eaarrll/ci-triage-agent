import pytest
import respx

from acme_sdk import Client, RetryPolicy

BASE_URL = "https://api.acme.example.com/v1"


@pytest.fixture
def api():
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        yield router


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _s: None)
    with Client(api_key="test-key", retry=RetryPolicy(jitter=0)) as c:
        yield c
