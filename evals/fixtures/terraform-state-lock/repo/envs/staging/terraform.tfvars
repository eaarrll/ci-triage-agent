kubernetes_version = "1.33"

user_node_pools = {
  general = {
    vm_size   = "Standard_D4s_v5"
    min_count = 1
    max_count = 4
  }
}
