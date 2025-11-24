import { ROLES } from '#common/helpers/auth/constants.js'
import { isInitialUser } from '#common/helpers/auth/roles/helpers.js'

export function getDefraIdRoles(linkedEprOrg, email) {
  if (isInitialUser(linkedEprOrg, email)) {
    return [ROLES.initialUser]
  }
}
