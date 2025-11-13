import { ROLES } from '#common/helpers/auth/constants.js'
import { getConfig } from '../../../config.js'

export async function getEntraUserRoles(tokenPayload) {
  const userEmail = tokenPayload.email || tokenPayload.preferred_username

  const stringifiedServiceMaintainersList = getConfig().get(
    'roles.serviceMaintainers'
  )

  const thisUserRoles = []
  // This should never thrown an error as the config is validated when the server is started
  const serviceMaintainersList = JSON.parse(stringifiedServiceMaintainersList)

  if (
    serviceMaintainersList.some(
      (email) => email.toLowerCase() === userEmail?.toLowerCase()
    )
  ) {
    thisUserRoles.push(ROLES.serviceMaintainer)
  }

  return thisUserRoles
}
