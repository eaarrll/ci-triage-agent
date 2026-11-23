terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate-prod"
    storage_account_name = "stexorgtfstateprod"
    container_name       = "tfstate"
    key                  = "prod/platform.tfstate"
    use_oidc             = true
    use_azuread_auth     = true
  }
}
