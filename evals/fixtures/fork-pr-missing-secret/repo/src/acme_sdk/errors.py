from __future__ import annotations

import httpx


class APIError(Exception):
    def __init__(self, status: int, message: str, request_id: str | None = None) -> None:
        super().__init__(f"{status}: {message}")
        self.status = status
        self.message = message
        self.request_id = request_id

    @classmethod
    def from_response(cls, response: httpx.Response) -> APIError:
        try:
            message = response.json().get("error", {}).get("message", response.text)
        except ValueError:
            message = response.text
        return cls(response.status_code, message, response.headers.get("x-request-id"))


class RateLimitError(APIError):
    @property
    def retry_after(self) -> float | None:
        return None if self._retry_after is None else float(self._retry_after)

    _retry_after: str | None = None

    @classmethod
    def from_response(cls, response: httpx.Response) -> RateLimitError:
        err = super().from_response(response)
        assert isinstance(err, RateLimitError)
        err._retry_after = response.headers.get("retry-after")
        return err
