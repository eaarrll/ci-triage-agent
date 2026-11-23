variable "name" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "kubernetes_version" {
  type = string
}

variable "system_node_count" {
  type    = number
  default = 3
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

variable "tags" {
  type    = map(string)
  default = {}
}
