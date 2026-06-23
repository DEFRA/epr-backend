import {
  extractUserDetails,
  recordSystemLog,
  safeAudit
} from '#root/auditing/helpers.js'

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {string} organisationId
 * @param {import('./add-or-update-organisation-user.js').OrganisationUserResult} result
 * @returns {Promise<void>}
 */
export async function auditOrganisationUserAdded(
  request,
  organisationId,
  result
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: result.outcome
    },
    context: {
      organisationId,
      previous: result.userBefore,
      next: result.userAfter
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
