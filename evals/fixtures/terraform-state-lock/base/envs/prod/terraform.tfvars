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
