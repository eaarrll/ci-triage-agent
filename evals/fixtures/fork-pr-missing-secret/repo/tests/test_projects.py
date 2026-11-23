import httpx

from acme_sdk.resources import Project


def test_list_follows_cursor(api, client):
    api.get("/projects", params={"limit": 100}).mock(
        return_value=httpx.Response(200, json={"data": [{"id": "p1", "name": "alpha"}], "next_cursor": "c2"})
    )
    api.get("/projects", params={"limit": 100, "cursor": "c2"}).mock(
        return_value=httpx.Response(200, json={"data": [{"id": "p2", "name": "beta"}], "next_cursor": None})
    )
    assert [p.name for p in client.projects.list()] == ["alpha", "beta"]


def test_archive(api, client):
    api.post("/projects/p1/archive").mock(
        return_value=httpx.Response(200, json={"id": "p1", "name": "alpha", "archived": True})
    )
    assert client.projects.archive("p1") == Project(id="p1", name="alpha", archived=True)
