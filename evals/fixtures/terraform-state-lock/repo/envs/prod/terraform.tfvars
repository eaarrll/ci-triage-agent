kubernetes_version = "1.33"

user_node_pools = {
  general = {
    vm_size   = "Standard_D8s_v5"
    min_count = 3
    max_count = 12
  }
  batch = {
    vm_size     = "Standard_E8s_v5"
    min_count   = 0
    max_count   = 6
    node_taints = ["workload=batch:NoSchedule"]
  }
}

log_analytics_workspace_id = "/subscriptions/9a2d6e10-3c5f-4b8e-b7a1-e4c0f2d9a853/resourceGroups/rg-observability-prod/providers/Microsoft.OperationalInsights/workspaces/log-platform-prod"
