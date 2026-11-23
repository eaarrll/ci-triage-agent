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
