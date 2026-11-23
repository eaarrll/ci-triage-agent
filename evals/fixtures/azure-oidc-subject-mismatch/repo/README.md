# payments-api

Payment intents, captures and refunds for the storefront, as a .NET 8 minimal API
running on Azure Container Apps.

```
src/Payments.Api/          the service and its Dockerfile
tests/Payments.Api.Tests/  xUnit tests
infra/                     Bicep for the container app and its deploy identity
docs/                      runbooks
```

## Development

```sh
dotnet restore
dotnet test
dotnet run --project src/Payments.Api
```

See [docs/deploying.md](docs/deploying.md) for how changes reach production.
