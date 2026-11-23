from __future__ import annotations

from types import TracebackType

from ._http import RetryPolicy, Transport
from .resources import Projects

DEFAULT_BASE_URL = "https://api.acme.example.com/v1"


class Client:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        retry: RetryPolicy | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._transport = Transport(base_url, api_key, retry=retry, timeout=timeout)
        self.projects = Projects(self._transport)

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> Client:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()
