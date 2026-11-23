# Storage runbook

## Accounts

| Environment | Account | Purpose |
| --- | --- | --- |
| staging | `stexorgplatformstg` | exports, scratch |
| prod | `stexorgplatformprod` | customer exports |

## Exports retention

Blobs under `exports/` move to the cool tier after 30 days and are deleted after
365 days (`azurerm_storage_management_policy.exports`).

## Access

Access is through Entra ID only; shared keys are disabled. Request the
`Storage Blob Data Reader` role through the access portal for read access.

## Diagnostics

Read, write and delete logs for the prod blob service go to the shared
`log-platform-prod` Log Analytics workspace (table `StorageBlobLogs`). Failed
requests from the last day:

```kusto
StorageBlobLogs
| where TimeGenerated > ago(1d)
| where AccountName == "stexorgplatformprod" and StatusCode >= 400
| summarize count() by OperationName, StatusText, CallerIpAddress
```
