targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerAppsEnvironmentId string
param registryName string = 'crpaymentsprod'

module deployIdentity 'modules/github-oidc.bicep' = {
  name: 'github-oidc'
  params: {
    location: location
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-payments-api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'payments-api'
          image: '${registry.properties.loginServer}/payments-api:bootstrap'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
      }
    }
  }
  tags: {
    service: 'payments-api'
    environment: 'prod'
  }
}

var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource deployCanPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, 'github-deploy', acrPushRoleId)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
    principalId: deployIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployCanUpdateApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(app.id, 'github-deploy', contributorRoleId)
  scope: app
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: deployIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

output deployClientId string = deployIdentity.outputs.clientId
