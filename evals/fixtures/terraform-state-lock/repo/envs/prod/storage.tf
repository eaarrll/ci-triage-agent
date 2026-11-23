resource "azurerm_storage_container" "exports" {
  name                  = "exports"
  storage_account_id    = module.storage.id
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "exports" {
  storage_account_id = module.storage.id

  rule {
    name    = "expire-exports"
    enabled = true
    filters {
      prefix_match = ["exports/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than = 30
        delete_after_days_since_modification_greater_than       = 365
      }
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "storage_blob" {
  name                       = "diag-blob-to-law"
  target_resource_id         = "${module.storage.id}/blobServices/default"
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category = "StorageRead"
  }
  enabled_log {
    category = "StorageWrite"
  }
  enabled_log {
    category = "StorageDelete"
  }

  enabled_metric {
    category = "Transaction"
  }
}
