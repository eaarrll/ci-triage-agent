variable "kubernetes_version" {
  type        = string
  description = "AKS control plane and node pool version."
}

variable "user_node_pools" {
  type = map(object({
    vm_size     = string
    min_count   = number
    max_count   = number
    node_taints = optional(list(string), [])
  }))
  default = {}
}

variable "log_analytics_workspace_id" {
  type        = string
  description = "Resource ID of the shared Log Analytics workspace that receives diagnostics."
}
