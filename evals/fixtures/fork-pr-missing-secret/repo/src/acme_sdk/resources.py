from __future__ import annotations

from collections.abc import Iterator

from pydantic import BaseModel

from ._http import Transport


class Project(BaseModel):
    id: str
    name: str
    archived: bool = False


class Projects:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, *, page_size: int = 100) -> Iterator[Project]:
        cursor: str | None = None
        while True:
            params = {"limit": page_size, **({"cursor": cursor} if cursor else {})}
            body = self._t.request("GET", "/projects", params=params).json()
            yield from (Project.model_validate(p) for p in body["data"])
            cursor = body.get("next_cursor")
            if not cursor:
                return

    def archive(self, project_id: str) -> Project:
        return Project.model_validate(self._t.request("POST", f"/projects/{project_id}/archive").json())
