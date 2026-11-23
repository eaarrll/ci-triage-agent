import httpx

from acme_sdk import APIError, RateLimitError


def _resp(status, **kw):
    return httpx.Response(status, request=httpx.Request("GET", "https://api.acme.example.com/v1/x"), **kw)


def test_message_from_error_body():
    err = APIError.from_response(_resp(400, json={"error": {"message": "name is required"}}))
    assert (err.status, err.message) == (400, "name is required")


def test_message_falls_back_to_text():
    assert APIError.from_response(_resp(500, text="upstream timeout")).message == "upstream timeout"


def test_request_id_is_kept():
    err = APIError.from_response(_resp(500, text="x", headers={"x-request-id": "req_123"}))
    assert err.request_id == "req_123"


def test_retry_after_missing():
    assert RateLimitError.from_response(_resp(429)).retry_after is None
