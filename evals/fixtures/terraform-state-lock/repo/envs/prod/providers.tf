terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
    azuread = {
      source = "hashicorp/azuread"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azuread" {
  version  = "~> 3.0"
  use_oidc = true
}

provider "azurerm" {
  features {}
  use_oidc            = true
  storage_use_azuread = true
}
