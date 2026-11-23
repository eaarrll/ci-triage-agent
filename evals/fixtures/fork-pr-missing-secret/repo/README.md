# acme-sdk

Python client for the Acme API.

```python
from acme_sdk import Client

with Client(api_key="...") as client:
    for project in client.projects.list():
        print(project.name)
```

See [docs/retries.md](docs/retries.md) for how the client retries failed requests.
