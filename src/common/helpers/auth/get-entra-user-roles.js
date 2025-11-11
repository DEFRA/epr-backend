import Boom from '@hapi/boom'
import { getConfig } from '../../../config.js'

export async function getEntraUserRoles(tokenPayload) {
  const userEmail = tokenPayload.email || tokenPayload.preferred_username

  const stringifiedUserRoles = getConfig().get('userRoles')

  let userRoles = {}
  const thisUserRoles = []
  try {
    userRoles = JSON.parse(stringifiedUserRoles)
    for (const userGroup of Object.keys(userRoles)) {
      if (userRoles[userGroup].includes(userEmail)) {
        thisUserRoles.push(userGroup)
      }
    }
  } catch (e) {
    // This should never happen as the config is validated at startup
    throw Boom.badImplementation('Error parsing user roles configuration')
  }

  return thisUserRoles
}
