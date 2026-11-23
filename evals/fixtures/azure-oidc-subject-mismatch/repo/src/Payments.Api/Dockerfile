FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/Payments.Api/Payments.Api.csproj src/Payments.Api/
RUN dotnet restore src/Payments.Api/Payments.Api.csproj
COPY src/ src/
RUN dotnet publish src/Payments.Api/Payments.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
USER app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Payments.Api.dll"]
