# AKS upgrades

1. Bump `kubernetes_version` in `envs/staging/terraform.tfvars`, merge, and let the
   staging apply finish. Node pools surge by 33%, so a full staging upgrade takes
   about 20 minutes.
2. Watch `kubectl get nodes -w` and the `platform-staging` dashboards for an hour.
3. Repeat for `envs/prod/terraform.tfvars`. A prod upgrade rolls three system nodes and
   up to 18 user nodes and usually takes 35 to 50 minutes.

Check the upgrade path first with `az aks get-upgrades -g rg-platform-<env> -n aks-platform-<env>`.
