locals {
  environment = "prod"
  location    = "westeurope"
  tags = {
    environment = local.environment
    managed_by  = "terraform"
    repository  = "example-org/platform-infra"
  }
}

resource "azurerm_resource_group" "platform" {
  name     = "rg-platform-${local.environment}"
  location = local.location
  tags     = local.tags
}

module "network" {
  source              = "../../modules/network"
  name                = "vnet-platform-${local.environment}"
  resource_group_name = azurerm_resource_group.platform.name
  location            = local.location
  address_space       = ["10.40.0.0/16"]
  subnets = {
    aks     = "10.40.0.0/20"
    private = "10.40.16.0/24"
  }
  tags = local.tags
}

module "aks" {
  source              = "../../modules/aks"
  name                = "aks-platform-${local.environment}"
  resource_group_name = azurerm_resource_group.platform.name
  location            = local.location
  subnet_id           = module.network.subnet_ids["aks"]
  kubernetes_version  = var.kubernetes_version
  system_node_count   = 3
  user_node_pools     = var.user_node_pools
  tags                = local.tags
}

module "storage" {
  source              = "../../modules/storage"
  name                = "stexorgplatformprod"
  resource_group_name = azurerm_resource_group.platform.name
  location            = local.location
  subnet_id           = module.network.subnet_ids["private"]
  tags                = local.tags
}

resource "random_id" "aks_admin_group" {
  byte_length = 4
}

resource "azuread_group" "aks_admins" {
  display_name     = "aks-platform-${local.environment}-admins-${random_id.aks_admin_group.hex}"
  security_enabled = true
}
