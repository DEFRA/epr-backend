import {
  extractUserDetails,
  recordSystemLog,
  safeAudit
} from '#root/auditing/helpers.js'

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {{ organisationId: string, organisationNumber: import('#domain/organisations/numbers.js').OrganisationNumber }} organisation
 * @param {import('./add-or-update-organisation-user.js').OrganisationUserResult} result
 * @returns {Promise<void>}
 */
export async function auditOrganisationUserAdded(
  request,
  { organisationId, organisationNumber },
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
      organisationNumber,
      previous: result.userBefore,
      next: result.userAfter
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
