import { getConfig } from '../../../config.js'

export async function getDefraUserRoles(tokenPayload, request) {
  const config = getConfig()
  if (config.isProduction) {
    throw new Error('Something went wrong')
  }
  return []
}
