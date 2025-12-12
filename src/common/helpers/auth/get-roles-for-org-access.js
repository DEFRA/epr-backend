import { ROLES } from '#common/helpers/auth/constants.js'

/**
 * Determines roles for organisation access.
 *
 * Note: Org mismatch and status checks have been moved to the org-access-plugin
 * (onPostAuth extension) to ensure proper 403 responses. This function now only
 * determines that the user is a standard user candidate - actual authorisation
 * happens in onPostAuth.
 *
 * @param {import('#common/hapi-types.js').HapiRequest} request - The Hapi request object
 * @returns {string[]} Array of role strings
 */
export const getRolesForOrganisationAccess = (request) => {
  const { organisationId } = request.params

  if (!organisationId) {
    // The user is not trying to access an organisation resource
    return []
  }

  // Return standardUser role - actual org access checks happen in onPostAuth
  return [ROLES.standardUser]
}
