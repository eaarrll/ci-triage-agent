terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate-staging"
    storage_account_name = "stexorgtfstatestg"
    container_name       = "tfstate"
    key                  = "staging/platform.tfstate"
    use_oidc             = true
    use_azuread_auth     = true
  }
}
