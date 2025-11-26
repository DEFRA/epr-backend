import { ROLES } from '#common/helpers/auth/constants.js'
import { isInitialUser } from '#common/helpers/auth/roles/helpers.js'

export function getDefraIdUserRoles(linkedEprOrg, tokenPayload) {
  const { email } = tokenPayload

  if (isInitialUser(linkedEprOrg, email)) {
    return [ROLES.initialUser]
  }

  return []
}
