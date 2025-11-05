import { getConfig } from '../../config.js'

async function getEntraUserRoles(tokenPayload, request) {
  return isEntraUserInServiceMaintainersAllowList(tokenPayload.email)
    ? ['service_maintainer']
    : []
}

async function getDefraUserRoles(tokenPayload, request) {
  const config = getConfig()
  if (config.isProduction) {
    throw new Error('Something went wron')
  }
  return []
}
