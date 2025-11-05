import Boom from '@hapi/boom'
import { getConfig } from '../../config.js'

export async function getEntraUserRoles(tokenPayload, request) {
  const userEmail = tokenPayload.email

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
    Boom.badImplementation('Error parsing user roles configuration')
  }

  return thisUserRoles
}
